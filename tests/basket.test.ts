import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const auth = vi.hoisted(() => ({ token: 'live-token', simulated: false }));
vi.mock('../src/lib/paypal-auth', () => ({
  getPayPalAccessToken: async () => auth.token,
  isUsingSimulatedToken: () => auth.simulated,
}));

import {
  basketContractHash,
  computeSettlement,
  validateSettlement,
  type BasketLine,
} from '../src/lib/basket';
import {
  authorizeBasket,
  BasketRuleError,
  createBasketAuthorization,
  settleBasket,
} from '../src/lib/paypal-basket';
import { restockStore, type RestockPurchaseOrder } from '../src/lib/restock-store';
import { verifyReceiptEd25519, type Ed25519Receipt } from '../src/lib/receipt-ed25519';

const line = (poId: string, usd: number, decision: BasketLine['decision'] = 'ALLOW'): BasketLine => ({
  poId,
  sku: `SKU-${poId}`,
  name: `Item ${poId}`,
  qty: 2,
  unitPriceCents: (usd / 2) * 100,
  lineCents: usd * 100,
  decision,
});

function seedPo(id: string, usd: number, decision: RestockPurchaseOrder['decision'] = 'ALLOW') {
  restockStore.savePurchaseOrder({
    id,
    sku: `SKU-${id}`,
    name: `Item ${id}`,
    category: 'Coffee Beans',
    qty: 2,
    unitPrice: usd / 2,
    totalPrice: usd,
    merchantName: 'RoastSupply Co',
    packSize: 1,
    verifiedMedianPrice: usd / 2,
    lastPaidPrice: usd / 2,
    decision,
    reasons: [],
    approvedByOwner: false,
    createdAt: new Date().toISOString(),
  });
}

describe('basket pure rules', () => {
  const mandate = () => restockStore.getMandate();
  const lines = [line('PO-A', 100), line('PO-B', 200, 'ASK'), line('PO-C', 300)];
  const base = () => ({ mandateId: mandate().id, lines, totalCents: 60000, contractHash: basketContractHash(mandate().id, lines) });

  it('contract hash ignores order but changes if any line changes', () => {
    const h = basketContractHash('M', lines);
    expect(basketContractHash('M', [...lines].reverse())).toBe(h);
    expect(basketContractHash('M', [{ ...lines[0], qty: 3 }, lines[1], lines[2]])).not.toBe(h);
    expect(basketContractHash('M', [{ ...lines[0], unitPriceCents: 5001 }, lines[1], lines[2]])).not.toBe(h);
    expect(basketContractHash('OTHER', lines)).not.toBe(h);
  });

  it('settlement splits captured vs released and voids when nothing is approved', () => {
    const p = computeSettlement(lines, ['PO-A', 'PO-C']);
    expect(p).toMatchObject({ action: 'CAPTURE', captureCents: 40000, releaseCents: 20000, finalCapture: true });
    expect(computeSettlement(lines, [])).toMatchObject({ action: 'VOID', captureCents: 0, releaseCents: 60000 });
  });

  it('validation rejects unknown ids, duplicates, BLOCK lines, tampered hash and budget overrun', () => {
    expect(validateSettlement(base(), ['PO-A'], mandate(), 0)).toEqual([]);
    expect(validateSettlement(base(), ['PO-X'], mandate(), 0).join()).toMatch(/not part of this authorization/);
    expect(validateSettlement(base(), ['PO-A', 'PO-A'], mandate(), 0).join()).toMatch(/Duplicate/);
    const blocked = [line('PO-A', 100, 'BLOCK')];
    expect(
      validateSettlement({ mandateId: 'M', lines: blocked, totalCents: 10000, contractHash: basketContractHash('M', blocked) }, ['PO-A'], mandate(), 0).join(),
    ).toMatch(/BLOCK/);
    expect(validateSettlement({ ...base(), contractHash: 'deadbeef' }, ['PO-A'], mandate(), 0).join()).toMatch(/Contract hash mismatch/);
    expect(validateSettlement(base(), ['PO-A', 'PO-C'], mandate(), 3700).join()).toMatch(/monthly budget/);
  });
});

/** Minimal in-process fake of the PayPal endpoints the basket flow touches. */
function installFakePayPal(opts: { captureAmountOverride?: string; captureStatus?: number } = {}) {
  const calls: Array<{ method: string; path: string; body: Record<string, any> | null; requestId: string | null }> = [];
  const state = { orderStatus: 'PAYER_ACTION_REQUIRED', customId: '', capturedValue: '' };

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, path: url.pathname, body, requestId: headers['PayPal-Request-Id'] ?? null });
    const ok = (json: unknown, status = 200) =>
      status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(json), { status });

    if (method === 'POST' && url.pathname === '/v2/checkout/orders') {
      state.customId = body.purchase_units[0].custom_id;
      return ok({ id: 'ORD-1', status: 'PAYER_ACTION_REQUIRED', links: [{ rel: 'payer-action', href: 'https://sandbox.paypal.com/approve' }] }, 201);
    }
    if (method === 'GET' && url.pathname === '/v2/checkout/orders/ORD-1') {
      return ok({ id: 'ORD-1', status: state.orderStatus, purchase_units: [{ custom_id: state.customId }] });
    }
    if (method === 'POST' && url.pathname === '/v2/checkout/orders/ORD-1/authorize') {
      return ok({ purchase_units: [{ payments: { authorizations: [{ id: 'AUTH-1', status: 'CREATED' }] } }] }, 201);
    }
    if (method === 'POST' && url.pathname === '/v2/payments/authorizations/AUTH-1/capture') {
      if (opts.captureStatus) return ok({ message: 'boom' }, opts.captureStatus);
      state.capturedValue = body.amount.value;
      return ok({ id: 'CAP-1', status: 'COMPLETED', seller_receivable_breakdown: { paypal_fee: { value: '1.23' } } }, 201);
    }
    if (method === 'GET' && url.pathname === '/v2/payments/captures/CAP-1') {
      return ok({ id: 'CAP-1', status: 'COMPLETED', final_capture: true, amount: { value: opts.captureAmountOverride ?? state.capturedValue } });
    }
    if (method === 'POST' && url.pathname === '/v2/payments/authorizations/AUTH-1/void') return ok({}, 204);
    if (method === 'GET' && url.pathname === '/v2/payments/authorizations/AUTH-1') return ok({ id: 'AUTH-1', status: 'VOIDED' });
    return ok({ message: `unexpected ${method} ${url.pathname}` }, 404);
  });
  return { calls, state };
}

describe('authorize -> per-line approval -> partial capture (PayPal fake)', () => {
  beforeEach(() => {
    restockStore.reset();
    auth.token = 'live-token';
    auth.simulated = false;
    seedPo('PO-A', 100);
    seedPo('PO-B', 200, 'ASK');
    seedPo('PO-C', 300);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('holds the whole basket, captures only approved lines with final_capture, releases the rest', async () => {
    const paypal = installFakePayPal();
    const basket = await createBasketAuthorization(['PO-A', 'PO-B', 'PO-C']);
    expect(basket.mode).toBe('SANDBOX');
    const create = paypal.calls.find((c) => c.path === '/v2/checkout/orders')!;
    expect(create.body!.intent).toBe('AUTHORIZE');
    expect(create.body!.purchase_units[0].custom_id).toBe(basket.contractHash);
    expect(create.body!.purchase_units[0].amount.value).toBe('600.00');
    expect(create.body!.purchase_units[0].amount.breakdown.item_total.value).toBe('600.00');
    expect(create.requestId).toBe(basket.requestIds.create);

    // Buyer has NOT approved yet: authorize must refuse and must not POST /authorize.
    await expect(authorizeBasket(basket.id)).rejects.toThrow(/buyer must approve/);
    expect(paypal.calls.some((c) => c.path.endsWith('/authorize'))).toBe(false);

    paypal.state.orderStatus = 'APPROVED';
    expect((await authorizeBasket(basket.id)).status).toBe('AUTHORIZED');

    const spendBefore = restockStore.spendSoFar;
    const settled = await settleBasket(basket.id, ['PO-A', 'PO-C']);
    const cap = paypal.calls.find((c) => c.path.endsWith('/capture'))!;
    expect(cap.body).toMatchObject({ amount: { currency_code: 'USD', value: '400.00' }, final_capture: true });
    expect(settled.status).toBe('SETTLED');
    expect(settled.capturedCents).toBe(40000);
    expect(settled.releasedCents).toBe(20000);
    expect(settled.readBack).toMatchObject({ source: 'PAYPAL_GET', status: 'COMPLETED', matches: true });
    expect(restockStore.spendSoFar).toBe(spendBefore + 400);
    expect(restockStore.getClaim('PO-A')?.status).toBe('CAPTURED');
    expect(restockStore.getClaim('PO-C')?.paypalCaptureId).toBe('CAP-1');
    expect(restockStore.getClaim('PO-B')).toBeUndefined(); // released line moved no money
    expect(restockStore.getSku('SKU-PO-A')).toBeUndefined();

    const receipt = settled.receipt as Ed25519Receipt;
    expect(verifyReceiptEd25519(receipt).valid).toBe(true);
    const tampered = { ...receipt, payload: { ...receipt.payload, capturedUsd: 600 } };
    expect(verifyReceiptEd25519(tampered as Ed25519Receipt).valid).toBe(false);

    // Idempotent: a second settle performs no second PayPal write.
    const writesBefore = paypal.calls.filter((c) => c.method === 'POST').length;
    await settleBasket(basket.id, ['PO-A', 'PO-B', 'PO-C']);
    expect(paypal.calls.filter((c) => c.method === 'POST').length).toBe(writesBefore);
    expect(restockStore.spendSoFar).toBe(spendBefore + 400);
  });

  it('voids the hold when the owner approves no line', async () => {
    const paypal = installFakePayPal();
    const basket = await createBasketAuthorization(['PO-A', 'PO-B']);
    paypal.state.orderStatus = 'APPROVED';
    await authorizeBasket(basket.id);
    const spendBefore = restockStore.spendSoFar;
    const settled = await settleBasket(basket.id, []);
    expect(settled.status).toBe('VOIDED');
    expect(paypal.calls.some((c) => c.path.endsWith('/void'))).toBe(true);
    expect(paypal.calls.some((c) => c.path.endsWith('/capture'))).toBe(false);
    expect(restockStore.spendSoFar).toBe(spendBefore);
  });

  it('a 5xx on capture leaves the basket UNKNOWN and counts nothing as paid', async () => {
    const paypal = installFakePayPal({ captureStatus: 503 });
    const basket = await createBasketAuthorization(['PO-A', 'PO-C']);
    paypal.state.orderStatus = 'APPROVED';
    await authorizeBasket(basket.id);
    const spendBefore = restockStore.spendSoFar;
    await expect(settleBasket(basket.id, ['PO-A'])).rejects.toThrow(/503/);
    expect(restockStore.baskets.get(basket.id)!.status).toBe('UNKNOWN');
    expect(restockStore.spendSoFar).toBe(spendBefore);
    expect(restockStore.getClaim('PO-A')).toBeUndefined();
  });

  it('a read-back amount mismatch is NOT counted as paid', async () => {
    const paypal = installFakePayPal({ captureAmountOverride: '99.00' });
    const basket = await createBasketAuthorization(['PO-A', 'PO-C']);
    paypal.state.orderStatus = 'APPROVED';
    await authorizeBasket(basket.id);
    const spendBefore = restockStore.spendSoFar;
    const out = await settleBasket(basket.id, ['PO-A']);
    expect(out.status).toBe('UNKNOWN');
    expect(out.readBack?.matches).toBe(false);
    expect(restockStore.spendSoFar).toBe(spendBefore);
    expect(restockStore.getClaim('PO-A')).toBeUndefined();
  });

  it('refuses BLOCKed lines, unknown POs, budget overrun, and overlapping baskets', async () => {
    installFakePayPal();
    seedPo('PO-X', 50, 'BLOCK');
    await expect(createBasketAuthorization(['PO-X'])).rejects.toBeInstanceOf(BasketRuleError);
    await expect(createBasketAuthorization(['NOPE'])).rejects.toThrow(/not found/);
    seedPo('PO-HUGE', 5000);
    await expect(createBasketAuthorization(['PO-HUGE'])).rejects.toThrow(/monthly budget/);
    await createBasketAuthorization(['PO-A']);
    await expect(createBasketAuthorization(['PO-A', 'PO-C'])).rejects.toThrow(/already in open basket/);
    await expect(createBasketAuthorization([])).rejects.toThrow(/at least one/);
  });

  it('settlement cannot approve a line outside the authorization', async () => {
    const paypal = installFakePayPal();
    const basket = await createBasketAuthorization(['PO-A']);
    paypal.state.orderStatus = 'APPROVED';
    await authorizeBasket(basket.id);
    await expect(settleBasket(basket.id, ['PO-C'])).rejects.toBeInstanceOf(BasketRuleError);
    expect(paypal.calls.some((c) => c.path.endsWith('/capture'))).toBe(false);
  });

  it('simulated mode is labelled SIMULATED_ and never calls PayPal', async () => {
    auth.token = 'simulated_token';
    auth.simulated = true;
    const paypal = installFakePayPal();
    const basket = await createBasketAuthorization(['PO-A', 'PO-C']);
    expect(basket.mode).toBe('SIMULATED');
    expect(basket.paypalOrderId).toMatch(/^SIMULATED_ORD_/);
    await authorizeBasket(basket.id);
    const settled = await settleBasket(basket.id, ['PO-C']);
    expect(settled.captureId).toMatch(/^SIMULATED_CAP_/);
    expect(settled.readBack?.source).toBe('SIMULATED');
    expect(paypal.calls.length).toBe(0);
  });
});
