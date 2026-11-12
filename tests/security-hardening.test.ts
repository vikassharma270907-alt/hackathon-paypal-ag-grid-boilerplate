import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const auth = vi.hoisted(() => ({ simulated: true }));
vi.mock('../src/lib/paypal-auth', async (orig) => ({
  ...(await orig<typeof import('../src/lib/paypal-auth')>()),
  getPayPalAccessToken: async () => (auth.simulated ? 'simulated_sandbox_token_x' : 'live_test_token'),
  isUsingSimulatedToken: () => auth.simulated,
}));

import { restockStore } from '../src/lib/restock-store';
import { runRestockCycle } from '../src/lib/restock-cycle';
import { createOrderForRestock, captureApprovedOrder } from '../src/lib/paypal';
import { POST as webhookPost } from '../src/app/api/paypal/webhook/route';
import { POST as agentPost } from '../src/app/api/agent/route';
import { PATCH as userPatch } from '../src/app/api/users/[id]/route';
import { POST as escrowPost } from '../src/app/api/paypal/escrow/route';
import { POST as aiResponsesPost } from '../src/app/api/ai/responses/route';
import { sanitizeUserInput, sanitizeProductInput } from '../src/lib/entity-input';
import { isValidMoney } from '../src/lib/validation';

const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('webhook verification fails closed and deduplicates', () => {
  const saved = { id: process.env.PAYPAL_WEBHOOK_ID, flag: process.env.ALLOW_UNSIGNED_WEBHOOKS };
  beforeEach(() => {
    restockStore.reset();
    delete process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
  });
  afterEach(() => {
    if (saved.id === undefined) delete process.env.PAYPAL_WEBHOOK_ID; else process.env.PAYPAL_WEBHOOK_ID = saved.id;
    if (saved.flag === undefined) delete process.env.ALLOW_UNSIGNED_WEBHOOKS; else process.env.ALLOW_UNSIGNED_WEBHOOKS = saved.flag;
  });

  it('rejects an event with 401 when PAYPAL_WEBHOOK_ID is not configured', async () => {
    const res = await webhookPost(json('/api/paypal/webhook', { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' }));
    expect(res.status).toBe(401);
    expect((await res.json()).verified).toBe(false);
    expect(restockStore.processedWebhookIds.has('WH-1')).toBe(false);
  });

  it('rejects an event with missing transmission headers when configured', async () => {
    process.env.PAYPAL_WEBHOOK_ID = 'REAL-WEBHOOK-ID-123';
    const res = await webhookPost(json('/api/paypal/webhook', { id: 'WH-2', event_type: 'X' }));
    expect(res.status).toBe(401);
  });

  it('with the explicit dev opt-in, accepts once and then reports a duplicate', async () => {
    process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
    const first = await webhookPost(json('/api/paypal/webhook', { id: 'WH-3', event_type: 'PAYMENT.CAPTURE.COMPLETED' }));
    expect(first.status).toBe(200);
    expect((await first.json()).verificationStatus).toBe('SANDBOX_SIMULATED');
    const second = await webhookPost(json('/api/paypal/webhook', { id: 'WH-3', event_type: 'PAYMENT.CAPTURE.COMPLETED' }));
    expect((await second.json()).duplicate).toBe(true);
  });

  it('rejects an event without an id', async () => {
    process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
    const res = await webhookPost(json('/api/paypal/webhook', { event_type: 'X' }));
    expect(res.status).toBe(400);
  });
});

describe('capture is bound to the claim and is replay safe', () => {
  beforeEach(() => {
    restockStore.reset();
    auth.simulated = true;
  });

  it('refuses a different order id (including a client-chosen SIMULATED_ id)', async () => {
    const { orders } = runRestockCycle({ autoApproveAllow: true });
    const po = orders[0];
    po.approvedByOwner = true;
    restockStore.savePurchaseOrder(po);
    const created = await createOrderForRestock(po.id);
    await expect(captureApprovedOrder(po.id, 'SIMULATED_ORD_attacker')).rejects.toThrow(/does not match/);
    expect(restockStore.getClaim(po.id)?.status).toBe('AWAITING_BUYER_APPROVAL');
    expect(created.paypalOrderId).toBeTruthy();
  });

  it('does not double-count spend when capture is replayed', async () => {
    const { orders } = runRestockCycle({ autoApproveAllow: true });
    const po = orders[0];
    po.approvedByOwner = true;
    restockStore.savePurchaseOrder(po);
    const created = await createOrderForRestock(po.id);
    const before = restockStore.spendSoFar;
    const first = await captureApprovedOrder(po.id, created.paypalOrderId!);
    expect(first.success).toBe(true);
    const afterFirst = restockStore.spendSoFar;
    expect(afterFirst).toBeCloseTo(before + po.totalPrice, 2);
    const replay = await captureApprovedOrder(po.id, created.paypalOrderId!);
    expect(replay.success).toBe(true);
    expect(restockStore.spendSoFar).toBe(afterFirst);
  });
});

describe('agent role cannot be self-asserted', () => {
  it('rejects callerRole=admin without operator credentials', async () => {
    const res = await agentPost(json('/api/agent', { action: 'SEARCH', callerRole: 'admin', intentQuery: 'capture' }));
    expect(res.status).toBe(403);
  });

  it('downgrades unknown roles to the least-privileged agent role', async () => {
    const res = await agentPost(json('/api/agent', { action: 'SEARCH', callerRole: 'root', intentQuery: '' }));
    expect(res.status).toBe(200);
    expect((await res.json()).callerRole).toBe('buyer_agent');
  });
});

describe('input validation blocks mass assignment and bad money', () => {
  it('drops server-controlled user fields and refuses the ADMIN role without operator access', () => {
    const ok = sanitizeUserInput({ name: 'A', riskScore: 0, id: 'x', paypalPayerId: 'p', totalSpendUsd: 9 }, { allowAdminRole: false });
    expect(ok).toEqual({ ok: true, value: { name: 'A' } });
    expect(sanitizeUserInput({ role: 'ADMIN' }, { allowAdminRole: false }).ok).toBe(false);
    expect(sanitizeUserInput({ role: 'ADMIN' }, { allowAdminRole: true }).ok).toBe(true);
    expect(sanitizeUserInput({ status: 'ROOT' }, { allowAdminRole: false }).ok).toBe(false);
    expect(sanitizeUserInput({ avatarUrl: 'javascript:alert(1)' }, { allowAdminRole: false }).ok).toBe(false);
  });

  it('PATCH /api/users/:id returns 400 for a privileged role escalation', async () => {
    const req = new NextRequest('http://localhost:3000/api/users/USR-8012', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    const res = await userPatch(req, { params: Promise.resolve({ id: 'USR-8012' }) });
    expect(res.status).toBe(400);
  });

  it('rejects negative, NaN, and over-precise product numbers', () => {
    expect(sanitizeProductInput({ priceUsd: -1 }).ok).toBe(false);
    expect(sanitizeProductInput({ priceUsd: Number.NaN }).ok).toBe(false);
    expect(sanitizeProductInput({ type: 'WEAPON' }).ok).toBe(false);
    expect(sanitizeProductInput({ priceUsd: 10, name: 'ok' }).ok).toBe(true);
  });

  it('isValidMoney accepts only positive amounts with at most 2 decimals', () => {
    for (const v of ['10', '10.5', 10.25, '0.01']) expect(isValidMoney(v)).toBe(true);
    for (const v of ['-1', '0', 'NaN', '1e3', '1.234', '', null, {}, '1,000']) expect(isValidMoney(v)).toBe(false);
  });

  it('escrow route rejects client money that is not a valid amount', async () => {
    const res = await escrowPost(json('/api/paypal/escrow', { action: 'CREATE_AUTHORIZATION', amountValue: '-5' }));
    expect(res.status).toBe(400);
    const res2 = await escrowPost(json('/api/paypal/escrow', { action: 'CAPTURE', authorizationId: 'A', verifiedCaptureAmount: 'NaN' }));
    expect(res2.status).toBe(400);
  });
});

describe('AI proxy limits', () => {
  it('rejects an oversized body before calling the provider', async () => {
    process.env.AG_STUDIO_OPENAI_API_KEY = process.env.AG_STUDIO_OPENAI_API_KEY || 'test-key';
    const req = new Request('http://localhost:3000/api/ai/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'content-length': '999999' },
      body: JSON.stringify({ input: 'x' }),
    });
    const res = await aiResponsesPost(req);
    expect([413, 503]).toContain(res.status);
  });
});
