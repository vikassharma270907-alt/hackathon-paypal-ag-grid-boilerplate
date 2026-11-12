/**
 * Regression tests for the 2026-11-12 full-stack audit (see docs/audits/BUGS_AND_FIXES.md, AUD-*).
 * Each test pins a defect that was reproducible on origin/main before the fix.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ token: 'simulated_sandbox_token_test' }));
vi.mock('../src/lib/paypal-auth', async (orig) => {
  const real = await orig<typeof import('../src/lib/paypal-auth')>();
  return {
    ...real,
    getPayPalAccessToken: async () => auth.token,
    isUsingSimulatedToken: () => auth.token.startsWith('simulated_'),
  };
});

import {
  createOrderForRestock,
  captureApprovedOrder,
  reconcileUnknownOrder,
  getPayPalOrderDetails,
} from '../src/lib/paypal';
import { settleAuthorizationHold } from '../src/lib/paypal-escrow-disputes';
import { restockStore } from '../src/lib/restock-store';
import { runRestockCycle } from '../src/lib/restock-cycle';
import { POST as escrowPost } from '../src/app/api/paypal/escrow/route';
import { POST as disputePost } from '../src/app/api/paypal/dispute/route';
import { POST as testBarPost } from '../src/app/api/test-bar/route';
import { GET as verifyGet } from '../src/app/api/restock/verify/route';
import { POST as restockPost } from '../src/app/api/restock/route';

type MutableEnv = Record<string, string | undefined>;
const env = process.env as MutableEnv;

function seedPo(id: string, opts: { approved?: boolean; decision?: 'ALLOW' | 'ASK' | 'BLOCK'; total?: number } = {}) {
  const total = opts.total ?? 304;
  restockStore.savePurchaseOrder({
    id,
    sku: 'CUPS-12OZ-500',
    name: '12oz Hot Paper Cups',
    category: 'Paper Goods & Packaging',
    qty: 8,
    unitPrice: total / 8,
    totalPrice: total,
    merchantName: 'EcoPackaging Direct',
    packSize: 2,
    verifiedMedianPrice: 40,
    lastPaidPrice: 38,
    decision: opts.decision ?? 'ALLOW',
    reasons: [],
    approvedByOwner: opts.approved ?? true,
    createdAt: new Date().toISOString(),
  });
}

const sameOrigin = (url: string, body: unknown) =>
  new NextRequest(`https://demo.example${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'https://demo.example', host: 'demo.example' },
    body: JSON.stringify(body),
  });

describe('AUD-001: every purchase order needs explicit owner approval (ALLOW included)', () => {
  beforeEach(() => restockStore.reset());

  it('refuses to create a PayPal order for any unapproved morning-run draft', async () => {
    // Behavioural check (the seeded drafts are ASK). The ALLOW-specific regression is the next test.
    const { orders } = runRestockCycle({ autoApproveAllow: false });
    const draft = orders[0];
    expect(draft.approvedByOwner).toBe(false);
    await expect(createOrderForRestock(draft.id)).rejects.toThrow(/requires explicit owner approval/);
    expect(restockStore.getClaim(draft.id)).toBeUndefined(); // nothing reached PayPal
  });

  it('refuses an unapproved ALLOW order (the regression), then allows it once approved', async () => {
    seedPo('PO-AUD1', { approved: false });
    await expect(createOrderForRestock('PO-AUD1')).rejects.toThrow(/owner approval/);
    restockStore.getPurchaseOrder('PO-AUD1')!.approvedByOwner = true;
    const res = await createOrderForRestock('PO-AUD1');
    expect(res.status).toBe('AWAITING_BUYER_APPROVAL');
  });

  it('capture also refuses an unapproved purchase order (defence in depth)', async () => {
    seedPo('PO-AUD1B');
    const { paypalOrderId } = await createOrderForRestock('PO-AUD1B');
    restockStore.getPurchaseOrder('PO-AUD1B')!.approvedByOwner = false;
    await expect(captureApprovedOrder('PO-AUD1B', paypalOrderId!)).rejects.toThrow(/not owner-approved/);
  });
});

describe('AUD-002: concurrent captures count spend exactly once', () => {
  beforeEach(() => restockStore.reset());

  it('second overlapping capture is rejected and spend/onOrder move once', async () => {
    seedPo('PO-AUD2');
    const { paypalOrderId } = await createOrderForRestock('PO-AUD2');
    const spend0 = restockStore.spendSoFar;
    const onOrder0 = restockStore.getSku('CUPS-12OZ-500')!.onOrder;

    const results = await Promise.allSettled([
      captureApprovedOrder('PO-AUD2', paypalOrderId!),
      captureApprovedOrder('PO-AUD2', paypalOrderId!),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as Error).name).toBe('PaymentInProgressError');

    expect(restockStore.spendSoFar).toBe(Number((spend0 + 304).toFixed(2)));
    expect(restockStore.getSku('CUPS-12OZ-500')!.onOrder).toBe(onOrder0 + 8);

    // A later replay is a no-op, not a second charge.
    await captureApprovedOrder('PO-AUD2', paypalOrderId!);
    expect(restockStore.spendSoFar).toBe(Number((spend0 + 304).toFixed(2)));
  });
});

describe('AUD-003: reconcile only resolves genuinely unknown outcomes and counts spend once', () => {
  beforeEach(() => restockStore.reset());

  it('refuses to reconcile an order the buyer never approved', async () => {
    seedPo('PO-AUD3A');
    await createOrderForRestock('PO-AUD3A');
    await expect(reconcileUnknownOrder('PO-AUD3A')).rejects.toThrow(/only UNKNOWN or CAPTURE_PENDING/);
    expect(restockStore.getClaim('PO-AUD3A')!.status).toBe('AWAITING_BUYER_APPROVAL');
  });

  it('refuses to flip a REFUNDED claim back to CAPTURED', async () => {
    seedPo('PO-AUD3B');
    await createOrderForRestock('PO-AUD3B');
    const c = restockStore.getClaim('PO-AUD3B')!;
    c.status = 'REFUNDED';
    restockStore.saveClaim(c);
    await expect(reconcileUnknownOrder('PO-AUD3B')).rejects.toThrow(/REFUNDED/);
    expect(restockStore.getClaim('PO-AUD3B')!.status).toBe('REFUNDED');
  });

  it('UNKNOWN -> CAPTURED counts spend and stock once, labelled SIMULATION', async () => {
    seedPo('PO-AUD3C');
    await createOrderForRestock('PO-AUD3C');
    const c = restockStore.getClaim('PO-AUD3C')!;
    c.status = 'UNKNOWN';
    restockStore.saveClaim(c);
    const spend0 = restockStore.spendSoFar;
    const onOrder0 = restockStore.getSku('CUPS-12OZ-500')!.onOrder;

    const claim = await reconcileUnknownOrder('PO-AUD3C');
    expect(claim.status).toBe('CAPTURED');
    expect(claim.paypalCaptureId).toMatch(/^SIMULATED_CAP_/);
    expect(restockStore.spendSoFar).toBe(Number((spend0 + 304).toFixed(2)));
    expect(restockStore.getSku('CUPS-12OZ-500')!.onOrder).toBe(onOrder0 + 8);
    expect(restockStore.getLedger()[0].notes).toContain('SIMULATION');

    // Already captured: a second reconcile must not count it again.
    await expect(reconcileUnknownOrder('PO-AUD3C')).rejects.toThrow();
    expect(restockStore.spendSoFar).toBe(Number((spend0 + 304).toFixed(2)));
  });
});

describe('AUD-004: an UNKNOWN outcome is never replaced by a fresh order', () => {
  beforeEach(() => restockStore.reset());

  it('createOrderForRestock refuses while the claim is UNKNOWN', async () => {
    seedPo('PO-AUD4');
    await createOrderForRestock('PO-AUD4');
    const c = restockStore.getClaim('PO-AUD4')!;
    c.status = 'UNKNOWN';
    restockStore.saveClaim(c);
    await expect(createOrderForRestock('PO-AUD4')).rejects.toThrow(/reconcile it instead/);
  });
});

describe('AUD-005: simulated read-back never invents PayPal data', () => {
  beforeEach(() => restockStore.reset());

  it('returns the local record labelled SIMULATION, with no fabricated status or amount', async () => {
    seedPo('PO-AUD5');
    const { paypalOrderId } = await createOrderForRestock('PO-AUD5');
    const details = await getPayPalOrderDetails(paypalOrderId!);
    expect(details.mode).toBe('SIMULATION');
    expect(details.paypalReadBack).toBe(false);
    expect(details).not.toHaveProperty('status'); // no invented PayPal status
    expect(details.localAmount).toEqual({ currency_code: 'USD', value: '304.00' }); // not a hardcoded 868.00
    expect(details.localClaimStatus).toBe('AWAITING_BUYER_APPROVAL');
  });

  it('reports NOT_FOUND for an unknown simulated id instead of COMPLETED', async () => {
    const details = await getPayPalOrderDetails('SIMULATED_ORD_DOES_NOT_EXIST');
    expect(details.localClaimStatus).toBe('NOT_FOUND');
    expect(details.localAmount).toBeNull();
  });
});

describe('AUD-006/007: money-moving escrow and dispute actions need an operator in production', () => {
  const saved: MutableEnv = {};
  beforeEach(() => {
    for (const k of ['NODE_ENV', 'ALLOW_PUBLIC_DEMO_WRITES', 'OPERATOR_API_KEY', 'PAYPAL_ENVIRONMENT']) saved[k] = env[k];
    env.NODE_ENV = 'production';
    env.ALLOW_PUBLIC_DEMO_WRITES = 'true'; // public sandbox demo path is open...
    env.PAYPAL_ENVIRONMENT = 'SANDBOX';
    delete env.OPERATOR_API_KEY;
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
  });

  it('escrow CAPTURE and VOID are denied on the public demo path', async () => {
    for (const action of ['CAPTURE', 'VOID']) {
      const res = await escrowPost(sameOrigin('/api/paypal/escrow', { action, authorizationId: 'AUTH-1', amountValue: '100.00' }));
      expect(res.status).toBe(503); // ...but settlement still needs OPERATOR_API_KEY
    }
  });

  it('an above-threshold (NEEDS_APPROVAL) hold is denied on the public demo path', async () => {
    const res = await escrowPost(
      sameOrigin('/api/paypal/escrow', { action: 'CREATE_AUTHORIZATION', amountValue: '2450.00', category: 'Office Equipment' })
    );
    expect(res.status).toBe(503);
  });

  it('dispute execution is denied, TRIAGE_ONLY still works', async () => {
    const exec = await disputePost(sameOrigin('/api/paypal/dispute', { strategyOverride: 'ACCEPT_CLAIM' }));
    expect(exec.status).toBe(503);
    const triage = await disputePost(sameOrigin('/api/paypal/dispute', { action: 'TRIAGE_ONLY' }));
    expect(triage.status).toBe(200);
    expect((await triage.json()).action).toBe('TRIAGE_ONLY');
  });
});

describe('AUD-008: simulation is decided by server state, never by a client id prefix', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    auth.token = 'simulated_sandbox_token_test';
  });

  it('a SIM- authorization id with a real token goes to PayPal instead of returning fake success', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ name: 'RESOURCE_NOT_FOUND' }), { status: 404 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const { trace } = await settleAuthorizationHold('live_test_token', 'SIM-AUTH-X', 'CAPTURE', '10.00', 'USD', 'req-1');
    expect(fetchSpy).toHaveBeenCalled();
    expect(trace.simulated).toBe(false);
    expect(trace.status).toBe(404);
  });
});

describe('AUD-009: escrow capture fails closed when PayPal authorization read-back fails', () => {
  it('returns 502 and does not capture', async () => {
    const mod = await import('../src/lib/paypal-escrow-disputes');
    const getSpy = vi.spyOn(mod, 'getAuthorizationDetails').mockResolvedValue({
      data: {},
      trace: { timestamp: '', method: 'GET', path: '/x', status: 500, paypalDebugId: null, latencyMs: 1, requestId: 'r' },
    });
    const settleSpy = vi.spyOn(mod, 'settleAuthorizationHold');
    const res = await escrowPost(
      new NextRequest('http://localhost:3000/api/paypal/escrow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CAPTURE', authorizationId: 'AUTH-1', amountValue: '100.00' }),
      })
    );
    expect(res.status).toBe(502);
    expect(settleSpy).not.toHaveBeenCalled();
    getSpy.mockRestore();
    settleSpy.mockRestore();
  });
});

describe('AUD-010: the judge test bar never presents invented PayPal identifiers', () => {
  const post = (testType: string) =>
    testBarPost(
      new NextRequest('http://localhost:3000/api/test-bar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testType }),
      })
    );

  it('settlement certificate is labelled SIMULATION with no fake auth/capture/debug ids', async () => {
    const body = await (await post('PROOF_OF_SETTLEMENT')).json();
    expect(body.certificate.dataMode).toBe('SIMULATION'); // renders the modal's SIMULATION banner
    const trace = body.certificate.paypalExecutionTrace;
    for (const v of [trace.authorizationId, trace.captureId, trace.paypalDebugId]) {
      expect(v).toContain('none (simulation');
    }
    expect(JSON.stringify(body)).not.toMatch(/AUTH-2026-78901|CAP-2026-44321|DEBUG-CERT-PROOF-9921/);
  });

  it('escrow auth reports SIMULATION mode and never a placeholder order/debug id', async () => {
    const body = await (await post('ESCROW_AUTH')).json();
    expect(body.mode).toBe('SIMULATION');
    expect(JSON.stringify(body)).not.toMatch(/ORD-2026-LIVE|SANDBOX-DEBUG-ID-OK/);
  });

  it('a blocked prompt-injection attack reports that no PayPal call was made', async () => {
    const body = await (await post('PROMPT_INJECTION_ATTACK')).json();
    expect(body.paypalCalled).toBe(false);
    expect(body).not.toHaveProperty('paypalDebugId');
  });
});

describe('AUD-011: the "Verify with PayPal GET" read-back route exists and is honest', () => {
  beforeEach(() => restockStore.reset());
  const get = (q: string) => verifyGet(new NextRequest(`http://localhost:3000/api/restock/verify${q}`));

  it('returns the labelled local record for a simulated order (was a 404 page)', async () => {
    seedPo('PO-AUD11');
    const { paypalOrderId } = await createOrderForRestock('PO-AUD11');
    const res = await get(`?id=${encodeURIComponent(paypalOrderId!)}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.details.mode).toBe('SIMULATION');
    expect(body.details.localAmount.value).toBe('304.00');
  });

  it('rejects a missing or malformed id before any PayPal call', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get('?id=../../v1/oauth2/token')).status).toBe(400);
    expect((await get(`?id=${'A'.repeat(65)}`)).status).toBe(400);
  });
});
describe('AUD-012: a payment rule refusal is a 409 conflict, not a 500 server error', () => {
  beforeEach(() => restockStore.reset());
  const post = (body: unknown) =>
    restockPost(
      new NextRequest('http://localhost:3000/api/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );

  it('unapproved CREATE_ORDER and premature RECONCILE return 409 with the rule message', async () => {
    seedPo('PO-AUD12', { approved: false });
    const create = await post({ action: 'CREATE_ORDER', poId: 'PO-AUD12' });
    expect(create.status).toBe(409);
    expect((await create.json()).error).toMatch(/owner approval/);

    restockStore.getPurchaseOrder('PO-AUD12')!.approvedByOwner = true;
    expect((await post({ action: 'CREATE_ORDER', poId: 'PO-AUD12' })).status).toBe(200);
    const rec = await post({ action: 'RECONCILE', poId: 'PO-AUD12' });
    expect(rec.status).toBe(409);
  });
});