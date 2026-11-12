import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../src/lib/paypal-auth', async (orig) => ({
  ...(await orig<typeof import('../src/lib/paypal-auth')>()),
  getPayPalAccessToken: async () => 'simulated_sandbox_token_x',
  isUsingSimulatedToken: () => true,
}));

import { restockStore } from '../src/lib/restock-store';
import { runRestockCycle } from '../src/lib/restock-cycle';
import { createOrderForRestock } from '../src/lib/paypal';
import { FixedWindowRateLimiter } from '../src/lib/rate-limit';
import { proxy } from '../src/proxy';

const openClaim = (poId: string, amount: number, status: 'AWAITING_BUYER_APPROVAL' | 'CAPTURED' = 'AWAITING_BUYER_APPROVAL') =>
  restockStore.saveClaim({
    poId, mandateId: 'm', status, amount, currency: 'USD', paypalRequestIdCreate: 'x', contractHash: 'h',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

describe('budget counts open, uncaptured orders (race fix)', () => {
  beforeEach(() => restockStore.reset());

  it('getReservedSpend sums open claims only and honours the exclusion', () => {
    openClaim('PO-OPEN-1', 100.1);
    openClaim('PO-OPEN-2', 200.2);
    openClaim('PO-DONE', 999, 'CAPTURED');
    expect(restockStore.getReservedSpend()).toBeCloseTo(300.3, 2);
    expect(restockStore.getReservedSpend({ poId: 'PO-OPEN-1' })).toBeCloseTo(200.2, 2);
  });

  it('refuses a new order when open orders would push spend over the monthly budget', async () => {
    const { orders } = runRestockCycle({ autoApproveAllow: true });
    const po = orders[0];
    po.approvedByOwner = true;
    restockStore.savePurchaseOrder(po);
    const budget = restockStore.getMandate().monthlyBudget;
    // Leave less headroom than this order needs, held by another unpaid order.
    openClaim('PO-OTHER-UNPAID', budget - restockStore.spendSoFar - po.totalPrice + 1);
    await expect(createOrderForRestock(po.id)).rejects.toThrow(/Budget breach/);
  });

  it('allows the same order when no other order is open', async () => {
    const { orders } = runRestockCycle({ autoApproveAllow: true });
    const po = orders[0];
    po.approvedByOwner = true;
    restockStore.savePurchaseOrder(po);
    const res = await createOrderForRestock(po.id);
    expect(res.success).toBe(true);
  });

  it('never overwrites a claim that was already captured', async () => {
    const { orders } = runRestockCycle({ autoApproveAllow: true });
    const po = orders[0];
    po.approvedByOwner = true;
    restockStore.savePurchaseOrder(po);
    openClaim(po.id, po.totalPrice, 'CAPTURED');
    await expect(createOrderForRestock(po.id)).rejects.toThrow(/already has a CAPTURED payment/);
    expect(restockStore.getClaim(po.id)?.status).toBe('CAPTURED');
  });
});

describe('rate limiter', () => {
  it('allows up to the limit per window, then reports Retry-After', () => {
    const rl = new FixedWindowRateLimiter(2, 60_000);
    expect(rl.check('a', 0).allowed).toBe(true);
    expect(rl.check('a', 1).allowed).toBe(true);
    const third = rl.check('a', 2);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(60);
    expect(rl.check('b', 2).allowed).toBe(true);
    expect(rl.check('a', 60_001).allowed).toBe(true);
  });

  it('evicts old keys beyond capacity', () => {
    const rl = new FixedWindowRateLimiter(1, 60_000, 2);
    rl.check('a', 0);
    rl.check('b', 0);
    rl.check('c', 0); // evicts "a"
    expect(rl.check('a', 1).allowed).toBe(true);
  });
});

describe('restock GET redaction', () => {
  it('hides raw PayPal error bodies from non-operators', async () => {
    const { GET } = await import('../src/app/api/restock/route');
    restockStore.reset();
    restockStore.saveClaim({
      poId: 'PO-ERR', mandateId: 'm', status: 'FAILED', amount: 5, currency: 'USD', paypalRequestIdCreate: 'x',
      contractHash: 'h', errorDetails: 'HTTP 500: internal upstream body', createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const res = await GET(new NextRequest('http://localhost:3000/api/restock'));
    const claim = (await res.json()).claims.find((c: { poId: string }) => c.poId === 'PO-ERR');
    expect(claim.errorDetails).toMatch(/Redacted/);
    expect(JSON.stringify(claim)).not.toContain('upstream body');
  });
});

describe('central API proxy', () => {
  const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    new NextRequest(`http://localhost:3000${path}`, {
      method: init.method ?? 'POST',
      headers: { host: 'localhost:3000', ...(init.headers ?? {}) },
    });

  it('blocks a cross-origin write to a route that has no guard of its own', () => {
    const res = proxy(req('/api/proofline/demo/reset', { headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
  });

  it('lets same-origin writes and all reads through (non-production)', () => {
    const write = proxy(req('/api/proofline/demo/reset', { headers: { origin: 'http://localhost:3000' } }));
    expect(write.headers.get('x-middleware-next')).toBe('1');
    const read = proxy(req('/api/users', { method: 'GET', headers: { origin: 'https://evil.example' } }));
    expect(read.headers.get('x-middleware-next')).toBe('1');
  });

  it('gates reads of user-submitted AI traces from cross-origin callers', () => {
    const res = proxy(req('/api/ai/traces', { method: 'GET', headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(403);
  });

  it('does not gate self-authenticated routes (webhook signature, cron secret)', () => {
    const res = proxy(req('/api/paypal/webhook', { headers: { origin: 'https://paypal.example' } }));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('rejects oversized bodies, with a tighter cap on AI routes', () => {
    expect(proxy(req('/api/ai/chat', { headers: { 'content-length': String(70 * 1024) } })).status).toBe(413);
    expect(proxy(req('/api/restock', { headers: { 'content-length': String(300 * 1024) } })).status).toBe(413);
    expect(proxy(req('/api/restock', { headers: { 'content-length': String(70 * 1024) } })).status).not.toBe(413);
  });

  it('rate limits quota-spending routes per client', () => {
    const headers = { 'x-forwarded-for': '203.0.113.77' };
    let last = 0;
    for (let i = 0; i < 31; i++) last = proxy(req('/api/gemini/extract', { headers })).status;
    expect(last).toBe(429);
    // A different client is unaffected.
    expect(proxy(req('/api/gemini/extract', { headers: { 'x-forwarded-for': '203.0.113.78' } })).status).not.toBe(429);
  });
});
