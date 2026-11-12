/**
 * Authorize -> per-line approval -> partial capture (PayPal Orders v2 + Payments v2).
 *
 *  1. createBasketAuthorization: ONE Orders v2 order with intent AUTHORIZE for all selected lines.
 *     custom_id = sha256 contract hash over the exact lines, written BEFORE the buyer approves.
 *  2. authorizeBasket: after the buyer approves on PayPal, GET must say APPROVED, then POST /authorize.
 *     This places the hold (valid up to 29 days; PayPal honors it for the first 3). It is a temporary hold,
 *     not escrow, and does not guarantee that funds settle.
 *  3. settleBasket: the owner approves line by line. Only approved lines are captured with
 *     final_capture: true (PayPal releases the rest of the hold). Nothing approved -> the hold is voided.
 *     After the write we GET the capture back and compare amount/status before marking anything paid.
 *
 * Safety: sandbox host guard, idempotent PayPal-Request-Id on every write, server-side re-validation,
 * timeouts/5xx -> UNKNOWN (never a blind retry), SIMULATED_ ids are always labelled.
 */
import { assertSandboxBaseUrl, getExecutionMode } from './paypal';
import { getPayPalAccessToken, isUsingSimulatedToken } from './paypal-auth';
import { restockStore, type LedgerEntry, type RestockClaim } from './restock-store';
import { signReceiptEd25519 } from './receipt-ed25519';
import {
  basketContractHash,
  centsToUsd,
  computeSettlement,
  sha256Hex,
  toCents,
  validateSettlement,
  type Basket,
  type BasketLine,
  type BasketReadBack,
} from './basket';

const SANDBOX = 'https://api-m.sandbox.paypal.com';
const TIMEOUT_MS = 15_000;
const TERMINAL = new Set(['SETTLED', 'VOIDED', 'FAILED']);

export class BasketRuleError extends Error {
  constructor(readonly violations: string[]) {
    super(violations.join('; '));
    this.name = 'BasketRuleError';
  }
}

class PayPalHttpError extends Error {
  constructor(readonly status: number, body: string) {
    super(`PayPal HTTP ${status}: ${body.slice(0, 240)}`);
  }
}

async function paypalFetch(path: string, init: RequestInit & { requestId?: string } = {}) {
  const token = await getPayPalAccessToken();
  const { requestId, headers, ...rest } = init;
  const res = await fetch(`${SANDBOX}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new PayPalHttpError(res.status, await res.text());
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as Record<string, unknown>;
}

const now = () => new Date().toISOString();

/** True when a failed write may or may not have reached PayPal (timeout, network, 5xx). */
function isAmbiguous(err: unknown): boolean {
  if (err instanceof PayPalHttpError) return err.status >= 500;
  return true; // AbortError / network failure
}

async function isSimulated(): Promise<boolean> {
  if (getExecutionMode() === 'SIMULATED') return true;
  const token = await getPayPalAccessToken();
  return isUsingSimulatedToken() || token.startsWith('simulated_');
}

function ledger(entry: Omit<LedgerEntry, 'id' | 'timestamp'>) {
  restockStore.addLedgerEntry({
    id: `LEDGER-${sha256Hex(`${entry.step}:${Date.now()}:${Math.random()}`).slice(0, 8).toUpperCase()}`,
    timestamp: now(),
    ...entry,
  });
}

function summaryFor(basket: Basket) {
  return { sku: 'BASKET', merchant: `${basket.lines.length}-line basket`, qty: basket.lines.reduce((s, l) => s + l.qty, 0) };
}

export function getBasket(id: string): Basket {
  const b = restockStore.baskets.get(id);
  if (!b) throw new Error(`Basket ${id} not found`);
  return b;
}

export function listBaskets(): Basket[] {
  return Array.from(restockStore.baskets.values());
}

function save(basket: Basket, patch: Partial<Basket> = {}): Basket {
  Object.assign(basket, patch, { updatedAt: now() });
  restockStore.baskets.set(basket.id, basket);
  return basket;
}

// ---------------------------------------------------------------------------------------------
// 1. Create the authorization order
// ---------------------------------------------------------------------------------------------
export async function createBasketAuthorization(poIds: string[]): Promise<Basket> {
  assertSandboxBaseUrl();
  const ids = Array.from(new Set(poIds)).sort();
  if (ids.length === 0) throw new BasketRuleError(['Select at least one purchase-order line']);

  const mandate = restockStore.getMandate();
  const violations: string[] = [];
  const lines: BasketLine[] = [];
  for (const id of ids) {
    const po = restockStore.getPurchaseOrder(id);
    if (!po) {
      violations.push(`${id} not found`);
      continue;
    }
    const claim = restockStore.getClaim(id);
    if (claim && !['DECLINED', 'FAILED', 'REFUNDED'].includes(claim.status)) {
      violations.push(`${id} already has a PayPal order in state ${claim.status}`);
    }
    if (po.decision === 'BLOCK') violations.push(`${id} is BLOCKed by mandate policy`);
    const unitPriceCents = toCents(po.unitPrice);
    lines.push({
      poId: po.id,
      sku: po.sku,
      name: po.name,
      qty: po.qty,
      unitPriceCents,
      lineCents: unitPriceCents * po.qty,
      decision: po.decision,
    });
  }
  const totalCents = lines.reduce((s, l) => s + l.lineCents, 0);
  if (!mandate.active) violations.push('Mandate is not active');
  // Open (uncaptured) orders and holds already reserve budget; count them too.
  const committedCents = Math.round((restockStore.spendSoFar + restockStore.getReservedSpend()) * 100);
  if (committedCents + totalCents > Math.round(mandate.monthlyBudget * 100)) {
    violations.push('Authorization hold would exceed the monthly budget (including open orders)');
  }
  const overlapping = listBaskets().find(
    (b) => !TERMINAL.has(b.status) && b.lines.some((l) => ids.includes(l.poId)),
  );
  if (overlapping) violations.push(`A line is already in open basket ${overlapping.id}`);
  if (violations.length) throw new BasketRuleError(violations);

  const key = sha256Hex(ids.join(',')).slice(0, 8).toUpperCase();
  const attempt = listBaskets().filter((b) => b.id.startsWith(`BSK-${key}`)).length + 1;
  const id = `BSK-${key}-a${attempt}`;
  const contractHash = basketContractHash(mandate.id, lines);
  const simulated = await isSimulated();

  const basket: Basket = save(
    {
      id,
      mandateId: mandate.id,
      lines,
      totalCents,
      contractHash,
      status: 'ORDER_CREATING',
      mode: simulated ? 'SIMULATED' : 'SANDBOX',
      approvedPoIds: [],
      releasedPoIds: [],
      capturedCents: 0,
      releasedCents: 0,
      requestIds: { create: sha256Hex(`${id}:create:${totalCents}`) },
      createdAt: now(),
      updatedAt: now(),
    },
    {},
  );

  if (simulated) {
    const orderId = `SIMULATED_ORD_${id.replace(/[^A-Za-z0-9]/g, '')}`;
    save(basket, {
      paypalOrderId: orderId,
      approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
      status: 'AWAITING_BUYER_APPROVAL',
    });
  } else {
    try {
      const order = await paypalFetch('/v2/checkout/orders', {
        method: 'POST',
        requestId: basket.requestIds.create,
        body: JSON.stringify({
          intent: 'AUTHORIZE',
          purchase_units: [
            {
              reference_id: id,
              custom_id: contractHash,
              description: `RestockPilot basket ${id} (${lines.length} lines)`,
              amount: {
                currency_code: 'USD',
                value: centsToUsd(totalCents),
                breakdown: { item_total: { currency_code: 'USD', value: centsToUsd(totalCents) } },
              },
              items: lines.map((l) => ({
                name: l.name.slice(0, 127),
                sku: l.sku,
                quantity: String(l.qty),
                unit_amount: { currency_code: 'USD', value: centsToUsd(l.unitPriceCents) },
                category: 'PHYSICAL_GOODS',
              })),
            },
          ],
          application_context: {
            brand_name: 'Sunrise Roasters Café',
            user_action: 'PAY_NOW',
            return_url: `https://restockpilot.local/demo?approved=true&basket=${id}`,
            cancel_url: `https://restockpilot.local/demo?cancelled=true&basket=${id}`,
          },
        }),
      });
      const links = (order.links as Array<{ rel: string; href: string }> | undefined) ?? [];
      save(basket, {
        paypalOrderId: String(order.id),
        approveUrl: links.find((l) => l.rel === 'approve' || l.rel === 'payer-action')?.href,
        status: 'AWAITING_BUYER_APPROVAL',
      });
    } catch (err) {
      save(basket, {
        status: isAmbiguous(err) ? 'UNKNOWN' : 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  ledger({
    ...summaryFor(basket),
    step: 'Authorization order created (hold requested)',
    total: totalCents / 100,
    savingsVsMedian: 0,
    decision: 'ASK',
    status: 'PENDING',
    paypalOrderId: basket.paypalOrderId,
    idempotencyHash: basket.requestIds.create,
    notes: `${basket.mode === 'SIMULATED' ? 'SIMULATED. ' : ''}intent=AUTHORIZE, custom_id contract hash ${contractHash.slice(0, 16)}…`,
  });
  return basket;
}

// ---------------------------------------------------------------------------------------------
// 2. Authorize after buyer approval
// ---------------------------------------------------------------------------------------------
export async function authorizeBasket(basketId: string): Promise<Basket> {
  assertSandboxBaseUrl();
  const basket = getBasket(basketId);
  if (basket.status === 'AUTHORIZED') return basket; // idempotent
  if (basket.status !== 'AWAITING_BUYER_APPROVAL' && basket.status !== 'UNKNOWN') {
    throw new Error(`Basket ${basketId} cannot be authorized from status ${basket.status}`);
  }
  const orderId = basket.paypalOrderId!;
  const authorizeRequestId = sha256Hex(`${basket.id}:authorize:${orderId}`);

  if (basket.mode === 'SIMULATED') {
    return finishAuthorize(basket, `SIMULATED_AUTH_${basket.id.replace(/[^A-Za-z0-9]/g, '')}`, authorizeRequestId);
  }

  try {
    const order = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    const unit = (order.purchase_units as Array<Record<string, unknown>> | undefined)?.[0];
    if (unit?.custom_id !== basket.contractHash) {
      throw new BasketRuleError(['PayPal custom_id does not match the basket contract hash']);
    }
    // Resolve a previous UNKNOWN: the authorize may have gone through already.
    const existing = (unit?.payments as { authorizations?: Array<{ id: string }> } | undefined)?.authorizations?.[0];
    if (existing?.id) return finishAuthorize(basket, existing.id, authorizeRequestId);

    if (order.status !== 'APPROVED') {
      throw new Error(`Order status is '${String(order.status)}'. The buyer must approve the hold on PayPal first.`);
    }
    save(basket, { requestIds: { ...basket.requestIds, authorize: authorizeRequestId } });
    const authorized = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
      method: 'POST',
      requestId: authorizeRequestId,
      body: '{}',
    });
    const auth = (
      (authorized.purchase_units as Array<{ payments?: { authorizations?: Array<{ id: string }> } }> | undefined)?.[0]
        ?.payments?.authorizations?.[0]
    );
    if (!auth?.id) throw new Error('PayPal did not return an authorization id');
    return finishAuthorize(basket, auth.id, authorizeRequestId);
  } catch (err) {
    if (!(err instanceof BasketRuleError) && isAmbiguous(err)) {
      save(basket, { status: 'UNKNOWN', error: err instanceof Error ? err.message : String(err) });
    }
    throw err;
  }
}

function finishAuthorize(basket: Basket, authorizationId: string, authorizeRequestId: string): Basket {
  save(basket, {
    authorizationId,
    status: 'AUTHORIZED',
    error: undefined,
    requestIds: { ...basket.requestIds, authorize: authorizeRequestId },
  });
  ledger({
    ...summaryFor(basket),
    step: 'Hold placed (authorization)',
    total: basket.totalCents / 100,
    savingsVsMedian: 0,
    decision: 'ASK',
    status: 'PENDING',
    paypalOrderId: basket.paypalOrderId,
    idempotencyHash: authorizeRequestId,
    notes: `${basket.mode === 'SIMULATED' ? 'SIMULATED. ' : ''}Authorization ${authorizationId}. A temporary hold, not escrow: nothing is captured until lines are approved.`,
  });
  return basket;
}

// ---------------------------------------------------------------------------------------------
// 3. Per-line approval -> partial capture (or void)
// ---------------------------------------------------------------------------------------------
export async function settleBasket(basketId: string, approvedPoIds: string[]): Promise<Basket> {
  assertSandboxBaseUrl();
  const basket = getBasket(basketId);
  if (basket.status === 'SETTLED' || basket.status === 'VOIDED') return basket; // idempotent, no second write
  if (basket.status !== 'AUTHORIZED' && basket.status !== 'UNKNOWN') {
    throw new Error(`Basket ${basketId} must be AUTHORIZED before settlement (status: ${basket.status})`);
  }
  if (!basket.authorizationId) throw new Error('Basket has no authorization to settle');

  const mandate = restockStore.getMandate();
  const violations = validateSettlement(
    basket,
    approvedPoIds,
    mandate,
    restockStore.spendSoFar + restockStore.getReservedSpend({ basketId: basket.id }),
  );
  if (violations.length) throw new BasketRuleError(violations);

  const plan = computeSettlement(basket.lines, approvedPoIds);
  const authId = basket.authorizationId;
  const writeId =
    plan.action === 'VOID'
      ? sha256Hex(`${basket.id}:void:${authId}`)
      : sha256Hex(`${basket.id}:capture:${authId}:${plan.captureCents}`);

  // Persist intent BEFORE the PayPal write.
  save(basket, {
    status: 'SETTLING',
    approvedPoIds: plan.captured.map((l) => l.poId),
    releasedPoIds: plan.released.map((l) => l.poId),
    requestIds: { ...basket.requestIds, [plan.action === 'VOID' ? 'void' : 'capture']: writeId },
  });

  let captureId: string | undefined;
  let fee: string | undefined;
  let readBack: BasketReadBack;

  try {
    if (basket.mode === 'SIMULATED') {
      captureId = plan.action === 'CAPTURE' ? `SIMULATED_CAP_${basket.id.replace(/[^A-Za-z0-9]/g, '')}` : undefined;
      fee = plan.action === 'CAPTURE' ? (plan.captureCents / 100 * 0.029 + 0.3).toFixed(2) : undefined;
      readBack = {
        source: 'SIMULATED',
        status: plan.action === 'CAPTURE' ? 'COMPLETED' : 'VOIDED',
        amountCents: plan.captureCents,
        customIdMatches: null,
        matches: true,
        checkedAt: now(),
      };
    } else if (plan.action === 'VOID') {
      await paypalFetch(`/v2/payments/authorizations/${encodeURIComponent(authId)}/void`, {
        method: 'POST',
        requestId: writeId,
        body: '{}',
      });
      const check = await paypalFetch(`/v2/payments/authorizations/${encodeURIComponent(authId)}`);
      readBack = {
        source: 'PAYPAL_GET',
        status: String(check.status),
        amountCents: 0,
        customIdMatches: null,
        matches: check.status === 'VOIDED',
        checkedAt: now(),
      };
    } else {
      const cap = await paypalFetch(`/v2/payments/authorizations/${encodeURIComponent(authId)}/capture`, {
        method: 'POST',
        requestId: writeId,
        body: JSON.stringify({
          amount: { currency_code: 'USD', value: centsToUsd(plan.captureCents) },
          final_capture: true,
          invoice_id: basket.id,
          note_to_payer: `RestockPilot approved ${plan.captured.length} of ${basket.lines.length} lines`,
        }),
      });
      captureId = String(cap.id);
      fee = (cap.seller_receivable_breakdown as { paypal_fee?: { value?: string } } | undefined)?.paypal_fee?.value;
      // Independent read-back: never mark paid from the write response alone.
      const check = await paypalFetch(`/v2/payments/captures/${encodeURIComponent(captureId)}`);
      const amount = toCents(Number((check.amount as { value?: string } | undefined)?.value ?? NaN));
      const okStatus = check.status === 'COMPLETED';
      readBack = {
        source: 'PAYPAL_GET',
        status: String(check.status),
        amountCents: Number.isFinite(amount) ? amount : null,
        customIdMatches: null,
        matches: okStatus && amount === plan.captureCents && check.final_capture === true,
        checkedAt: now(),
      };
    }
  } catch (err) {
    save(basket, {
      status: isAmbiguous(err) ? 'UNKNOWN' : 'AUTHORIZED',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return applySettlement(basket, plan, captureId, fee, readBack);
}

function applySettlement(
  basket: Basket,
  plan: ReturnType<typeof computeSettlement>,
  captureId: string | undefined,
  fee: string | undefined,
  readBack: BasketReadBack,
): Basket {
  // PENDING captures (e.g. eCheck) are reported honestly and never counted as paid.
  const paid = plan.action === 'CAPTURE' && readBack.matches;

  if (paid) {
    for (const line of plan.captured) {
      const po = restockStore.getPurchaseOrder(line.poId)!;
      po.approvedByOwner = true;
      po.approvedAt = now();
      restockStore.savePurchaseOrder(po);
      const claim: RestockClaim = {
        poId: po.id,
        mandateId: basket.mandateId,
        status: 'CAPTURED',
        paypalOrderId: basket.paypalOrderId,
        paypalCaptureId: captureId,
        paypalFee: fee,
        amount: line.lineCents / 100,
        currency: 'USD',
        paypalRequestIdCreate: basket.requestIds.create,
        paypalRequestIdCapture: basket.requestIds.capture,
        contractHash: basket.contractHash,
        createdAt: basket.createdAt,
        updatedAt: now(),
      };
      restockStore.saveClaim(claim);
      restockStore.updateOnOrder(po.sku, po.qty);
    }
    restockStore.spendSoFar = Number((restockStore.spendSoFar + plan.captureCents / 100).toFixed(2));
  }

  const receipt = signReceiptEd25519({
    kind: 'PARTIAL_CAPTURE_RECEIPT',
    basketId: basket.id,
    contractHash: basket.contractHash,
    paypalOrderId: basket.paypalOrderId ?? null,
    authorizationId: basket.authorizationId ?? null,
    captureId: captureId ?? null,
    mode: basket.mode,
    authorizedUsd: basket.totalCents / 100,
    capturedUsd: paid ? plan.captureCents / 100 : 0,
    releasedUsd: paid || plan.action === 'VOID' ? plan.releaseCents / 100 : 0,
    approvedLines: plan.captured.map((l) => ({ poId: l.poId, sku: l.sku, usd: l.lineCents / 100 })),
    releasedLines: plan.released.map((l) => ({ poId: l.poId, sku: l.sku, usd: l.lineCents / 100 })),
    readBackStatus: readBack.status,
    readBackMatches: readBack.matches,
  });

  save(basket, {
    status: plan.action === 'VOID' ? 'VOIDED' : paid ? 'SETTLED' : 'UNKNOWN',
    captureId,
    paypalFee: fee,
    capturedCents: paid ? plan.captureCents : 0,
    releasedCents: plan.action === 'VOID' || paid ? plan.releaseCents : 0,
    readBack,
    receipt,
    error: plan.action === 'CAPTURE' && !paid ? `Capture read-back did not match (status ${readBack.status}); not counted as paid` : undefined,
  });

  ledger({
    ...summaryFor(basket),
    step:
      plan.action === 'VOID'
        ? 'Hold voided (no line approved)'
        : paid
          ? `Partial capture: ${plan.captured.length}/${basket.lines.length} lines, remainder released`
          : 'Capture read-back mismatch',
    total: plan.action === 'VOID' ? 0 : plan.captureCents / 100,
    savingsVsMedian: 0,
    decision: 'ALLOW',
    status: paid ? 'CAPTURED' : plan.action === 'VOID' ? 'PENDING' : 'UNKNOWN',
    paypalOrderId: basket.paypalOrderId,
    paypalCaptureId: captureId,
    idempotencyHash: basket.requestIds.capture ?? basket.requestIds.void ?? basket.requestIds.create,
    notes: `${basket.mode === 'SIMULATED' ? 'SIMULATED. ' : ''}Captured $${(plan.captureCents / 100).toFixed(2)} (final_capture=true), released $${(plan.releaseCents / 100).toFixed(2)}. Read-back: ${readBack.status}${readBack.matches ? ' ✓' : ' ✗'}.`,
  });
  return basket;
}

/**
 * Recovery for UNKNOWN: ask PayPal what actually happened (fresh GET on the order) instead of retrying a write.
 */
export async function reconcileBasket(basketId: string): Promise<Basket> {
  assertSandboxBaseUrl();
  const basket = getBasket(basketId);
  if (basket.mode === 'SIMULATED' || !basket.paypalOrderId) return basket;
  const order = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(basket.paypalOrderId)}`);
  const payments = (order.purchase_units as Array<{ payments?: { captures?: Array<{ id: string; status: string; amount?: { value: string } }>; authorizations?: Array<{ id: string; status: string }> } }> | undefined)?.[0]?.payments;
  const capture = payments?.captures?.[0];
  const auth = payments?.authorizations?.[0];
  if (auth?.id && !basket.authorizationId) save(basket, { authorizationId: auth.id });

  if (capture && capture.status === 'COMPLETED') {
    const capturedCents = toCents(Number(capture.amount?.value ?? 0));
    const approved = basket.lines.filter((l) => basket.approvedPoIds.includes(l.poId));
    const plan = computeSettlement(basket.lines, approved.map((l) => l.poId));
    if (plan.captureCents === capturedCents && basket.status !== 'SETTLED') {
      return applySettlement(basket, plan, capture.id, undefined, {
        source: 'PAYPAL_GET',
        status: capture.status,
        amountCents: capturedCents,
        customIdMatches: null,
        matches: true,
        checkedAt: now(),
      });
    }
  } else if (auth?.status === 'VOIDED' && basket.status !== 'VOIDED') {
    return applySettlement(basket, computeSettlement(basket.lines, []), undefined, undefined, {
      source: 'PAYPAL_GET',
      status: 'VOIDED',
      amountCents: 0,
      customIdMatches: null,
      matches: true,
      checkedAt: now(),
    });
  } else if (auth?.status === 'CREATED' && basket.status === 'UNKNOWN') {
    save(basket, { status: 'AUTHORIZED', error: undefined });
  }
  return basket;
}
