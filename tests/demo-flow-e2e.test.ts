import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getRestock, POST as postRestock } from '../src/app/api/restock/route';
import { GET as getReceipt, POST as postReceipt } from '../src/app/api/receipt/route';
import { restockStore } from '../src/lib/restock-store';

const req = (url: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const restock = async (body: unknown) => (await postRestock(req('/api/restock', body))).json();
const receipt = async (body: unknown) => (await postReceipt(req('/api/receipt', body))).json();

describe('Demo page server flow (what the UI buttons call)', () => {
  beforeEach(async () => {
    await restock({ action: 'RESET' });
  });

  it('Run cycle: OAT-MILK is skipped (in-transit), ESPRESSO gets 14 bags, trap offer not selected', async () => {
    const res = await restock({ action: 'RUN_CYCLE' });
    expect(res.success).toBe(true);
    const skus = res.orders.map((o: { sku: string }) => o.sku);
    expect(skus).not.toContain('OAT-MILK-6PK');
    const espresso = res.orders.find((o: { sku: string }) => o.sku === 'ESPRESSO-5LB');
    expect(espresso.qty).toBe(14);
    expect(espresso.unitPrice).toBe(62);
    expect(espresso.verifiedMedianPrice).toBe(63.25);
    // $868 > ask-first threshold: owner must approve (ASK), not auto-approve.
    expect(espresso.decision).toBe('ASK');
    expect(espresso.reasons.join(' ')).toContain('auto-approval threshold');
    expect(espresso.costPerBaseUnit).toContain('/ lb');
  });

  it('GET /api/restock exposes inventory + calculations used for days-of-stock display', async () => {
    const json = await (await getRestock()).json();
    expect(json.inventory.length).toBeGreaterThan(0);
    expect(json.calculations.length).toBe(json.inventory.length);
  });

  it('Receipt: sign -> verify valid -> tampered rejected, for a stored PO', async () => {
    const { orders } = await restock({ action: 'RUN_CYCLE' });
    const poId = orders[0].id;
    const signed = await receipt({ action: 'SIGN', poId });
    expect(signed.receipt.algorithm).toBe('Ed25519');
    expect(signed.publicKeyPem).toContain('BEGIN PUBLIC KEY');

    expect((await receipt({ action: 'VERIFY', receipt: signed.receipt })).valid).toBe(true);

    const tampered = {
      ...signed.receipt,
      payload: { ...signed.receipt.payload, totalPrice: signed.receipt.payload.totalPrice + 100 },
    };
    expect((await receipt({ action: 'VERIFY', receipt: tampered })).valid).toBe(false);
  });

  it('Receipt: unknown PO is a 404, unknown action a 400, GET exposes key + AI budget', async () => {
    const r1 = await postReceipt(req('/api/receipt', { action: 'SIGN', poId: 'nope' }));
    expect(r1.status).toBe(404);
    const r2 = await postReceipt(req('/api/receipt', { action: 'WAT' }));
    expect(r2.status).toBe(400);
    const g = await (await getReceipt()).json();
    expect(g.algorithm).toBe('Ed25519');
    expect(g.aiBudget).toMatchObject({ cap: expect.any(Number), used: expect.any(Number) });
  });

  it('Refund action restores budget via the API and rejects a double refund with 500 error text', async () => {
    const { orders } = await restock({ action: 'RUN_CYCLE' });
    const po = orders[0];
    restockStore.saveClaim({
      poId: po.id, mandateId: 'm', status: 'CAPTURED', amount: po.totalPrice, currency: 'USD',
      paypalRequestIdCreate: 'x', contractHash: 'h',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    restockStore.spendSoFar += po.totalPrice;
    const before = restockStore.spendSoFar;

    const ok = await restock({ action: 'REFUND_RESTORE_BUDGET', poId: po.id });
    expect(ok.success).toBe(true);
    expect(restockStore.spendSoFar).toBe(before - po.totalPrice);

    const again = await postRestock(req('/api/restock', { action: 'REFUND_RESTORE_BUDGET', poId: po.id }));
    expect(again.status).toBe(500);
    expect((await again.json()).error).toMatch(/already refunded/);
  });
});
