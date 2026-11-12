import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ simulated: false }));
vi.mock('../src/lib/paypal-auth', () => ({
  getPayPalAccessToken: async () => (auth.simulated ? 'simulated_sandbox_token_x' : 'live_test_token'),
  isUsingSimulatedToken: () => auth.simulated,
}));

import { refundCapturedOrder } from '../src/lib/paypal';
import { restockStore, computeSha256 } from '../src/lib/restock-store';
import { runRestockCycle } from '../src/lib/restock-cycle';
import { GET as morningGet, POST as morningPost } from '../src/app/api/cron/morning-run/route';

function seedCaptured(poId: string, captureId: string, total = 868, qty = 14) {
  restockStore.savePurchaseOrder({
    id: poId, sku: 'ESPRESSO-5LB', name: 'Espresso', category: 'Coffee Beans', qty, unitPrice: total / qty,
    totalPrice: total, merchantName: 'RoastSupply Co', packSize: 1, verifiedMedianPrice: 63.25, lastPaidPrice: 60,
    decision: 'ALLOW', reasons: [], approvedByOwner: true, createdAt: new Date().toISOString(),
  });
  restockStore.saveClaim({
    poId, mandateId: 'm', status: 'CAPTURED', paypalOrderId: 'ORD-1', paypalCaptureId: captureId, amount: total,
    currency: 'USD', paypalRequestIdCreate: 'x', contractHash: 'h',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  restockStore.spendSoFar += total;
  restockStore.updateOnOrder('ESPRESSO-5LB', qty);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Refund via PayPal Payments v2', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    restockStore.reset();
    auth.simulated = false;
    process.env.PAYPAL_CLIENT_ID = 'real-looking-id';
    process.env.PAYPAL_CLIENT_SECRET = 'real-looking-secret';
    process.env.PAYPAL_SECRET = 'real-looking-secret';
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('calls POST /captures/{id}/refund with an idempotency key, reads back, then restores budget', async () => {
    seedCaptured('PO-R1', '5CAPTURE123');
    const before = restockStore.spendSoFar - 868;
    const calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string });
      if (url.endsWith('/refund')) return json({ id: 'REF-9', status: 'PENDING' }, 201);
      if (url.includes('/v2/payments/refunds/REF-9')) return json({ id: 'REF-9', status: 'COMPLETED', amount: { value: '868.00', currency_code: 'USD' } });
      return json({}, 404);
    }) as typeof fetch;

    const res = await refundCapturedOrder('PO-R1', 'Wrong delivery');
    expect(res.success).toBe(true);
    expect(res.mode).toBe('SANDBOX');
    expect(res.refundId).toBe('REF-9');
    expect(res.paypalRequestIdRefund).toBe(computeSha256('PO-R1:refund:5CAPTURE123'));

    const post = calls[0];
    expect(post.url).toBe('https://api-m.sandbox.paypal.com/v2/payments/captures/5CAPTURE123/refund');
    expect(post.method).toBe('POST');
    expect(post.headers['PayPal-Request-Id']).toBe(res.paypalRequestIdRefund);
    expect(JSON.parse(post.body!).amount).toEqual({ value: '868.00', currency_code: 'USD' });
    expect(calls[1].url).toContain('/v2/payments/refunds/REF-9'); // read-back happened

    expect(restockStore.spendSoFar).toBe(before);
    expect(restockStore.getClaim('PO-R1')!.status).toBe('REFUNDED');
    expect(restockStore.getClaim('PO-R1')!.paypalRefundId).toBe('REF-9');
    expect(restockStore.getLedger()[0].notes).toContain('PayPal refund REF-9');
  });

  it('does NOT restore budget while PayPal reports the refund as PENDING', async () => {
    seedCaptured('PO-R2', 'CAP2');
    const spend = restockStore.spendSoFar;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/refund')) return json({ id: 'REF-P', status: 'PENDING' }, 201);
      return json({ id: 'REF-P', status: 'PENDING', amount: { value: '868.00', currency_code: 'USD' } });
    }) as typeof fetch;

    const res = await refundCapturedOrder('PO-R2');
    expect(res.success).toBe(false);
    expect(res.refundStatus).toBe('PENDING');
    expect(restockStore.spendSoFar).toBe(spend);
    expect(restockStore.getClaim('PO-R2')!.status).toBe('CAPTURED');
  });

  it('refuses to restore budget when PayPal read-back amount differs from the order', async () => {
    seedCaptured('PO-R3', 'CAP3');
    const spend = restockStore.spendSoFar;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/refund')) return json({ id: 'REF-M', status: 'COMPLETED' }, 201);
      return json({ id: 'REF-M', status: 'COMPLETED', amount: { value: '1.00', currency_code: 'USD' } });
    }) as typeof fetch;

    const res = await refundCapturedOrder('PO-R3');
    expect(res.success).toBe(false);
    expect(res.message).toContain('different from the order');
    expect(restockStore.spendSoFar).toBe(spend);
  });

  it('leaves state unchanged on a PayPal 5xx so a retry reuses the same idempotency key', async () => {
    seedCaptured('PO-R4', 'CAP4');
    const spend = restockStore.spendSoFar;
    globalThis.fetch = vi.fn(async () => json({ name: 'INTERNAL_SERVER_ERROR' }, 500)) as typeof fetch;

    await expect(refundCapturedOrder('PO-R4')).rejects.toThrow(/HTTP 500/);
    expect(restockStore.spendSoFar).toBe(spend);
    expect(restockStore.getClaim('PO-R4')!.status).toBe('CAPTURED');
    expect(restockStore.getClaim('PO-R4')!.errorDetails).toContain('500');
  });

  it('two concurrent refund requests refund once and restore the budget once', async () => {
    seedCaptured('PO-RC', 'CAPRC');
    const before = restockStore.spendSoFar - 868;
    let refundPosts = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/refund')) {
        refundPosts += 1;
        return json({ id: 'REF-C', status: 'COMPLETED' }, 201);
      }
      return json({ id: 'REF-C', status: 'COMPLETED', amount: { value: '868.00', currency_code: 'USD' } });
    }) as typeof fetch;

    const [a, b] = await Promise.allSettled([refundCapturedOrder('PO-RC'), refundCapturedOrder('PO-RC')]);
    const results = [a, b].filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<{ success: boolean }>).value);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.success)).toBe(true);
    expect(refundPosts).toBeLessThanOrEqual(2);
    expect(restockStore.spendSoFar).toBe(before); // restored exactly once, never double-credited
    expect(restockStore.getClaim('PO-RC')!.status).toBe('REFUNDED');
  });

  it('simulated mode makes no network call and labels the id SIMULATED_REF_', async () => {
    auth.simulated = true;
    seedCaptured('PO-R5', 'SIMULATED_CAP_X');
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const res = await refundCapturedOrder('PO-R5');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.mode).toBe('SIMULATED');
    expect(res.refundId).toMatch(/^SIMULATED_REF_/);
    expect(res.message).toContain('Not a real PayPal refund');
    expect(restockStore.getClaim('PO-R5')!.status).toBe('REFUNDED');
  });

  it('rejects double refunds and refunds of non-captured orders', async () => {
    auth.simulated = true;
    seedCaptured('PO-R6', 'SIMULATED_CAP_Y');
    await refundCapturedOrder('PO-R6');
    await expect(refundCapturedOrder('PO-R6')).rejects.toThrow(/already refunded/);

    seedCaptured('PO-R7', 'CAP7');
    const c = restockStore.getClaim('PO-R7')!;
    c.status = 'AWAITING_BUYER_APPROVAL';
    restockStore.saveClaim(c);
    await expect(refundCapturedOrder('PO-R7')).rejects.toThrow(/Only CAPTURED/);
  });
});

describe('Morning run (drafts only)', () => {
  beforeEach(() => {
    restockStore.reset();
    delete process.env.CRON_SECRET;
  });

  const cronReq = (token?: string) =>
    new NextRequest('http://localhost:3000/api/cron/morning-run', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it('is disabled (503) when CRON_SECRET is not configured', async () => {
    const res = await morningGet(cronReq('anything'));
    expect(res.status).toBe(503);
  });

  it('rejects a wrong or missing token (401)', async () => {
    process.env.CRON_SECRET = 's3cret-value';
    expect((await morningGet(cronReq())).status).toBe(401);
    expect((await morningGet(cronReq('wrong'))).status).toBe(401);
  });

  it('creates unapproved drafts only, never a PayPal claim, and skips the in-transit oat milk', async () => {
    process.env.CRON_SECRET = 's3cret-value';
    const res = await morningPost(cronReq('s3cret-value'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.draftsCreated).toBeGreaterThan(0);
    expect(body.drafts.every((d: { approvedByOwner: boolean }) => d.approvedByOwner === false)).toBe(true);
    expect(body.drafts.map((d: { sku: string }) => d.sku)).not.toContain('OAT-MILK-6PK');
    expect(Array.from(restockStore.claims.values())).toHaveLength(0); // nothing sent to PayPal
    expect(body.note).toContain('Drafts only');
  });

  it('is idempotent: a second run creates no duplicate drafts', async () => {
    process.env.CRON_SECRET = 's3cret-value';
    const first = await (await morningPost(cronReq('s3cret-value'))).json();
    const second = await (await morningPost(cronReq('s3cret-value'))).json();
    expect(first.draftsCreated).toBeGreaterThan(0);
    expect(second.draftsCreated).toBe(0);
    expect(second.skipped.some((s: { reason: string }) => s.reason.includes('open order'))).toBe(true);
  });

  it('owner button flow still pre-approves ALLOW orders (autoApproveAllow: true)', () => {
    const { orders } = runRestockCycle({ autoApproveAllow: true });
    const allow = orders.filter((o) => o.decision === 'ALLOW');
    expect(allow.every((o) => o.approvedByOwner)).toBe(true);
    expect(orders.filter((o) => o.decision !== 'ALLOW').every((o) => !o.approvedByOwner)).toBe(true);
  });
});
