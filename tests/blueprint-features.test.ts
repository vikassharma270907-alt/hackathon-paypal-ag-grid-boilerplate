import { describe, it, expect, beforeEach } from 'vitest';
import {
  signReceiptEd25519,
  verifyReceiptEd25519,
  getReceiptPublicKeyPem,
  canonicalJson,
} from '../src/lib/receipt-ed25519';
import { aiBudgetStatus, tryConsumeAiCall, resetAiBudget } from '../src/lib/ai-budget';
import { callGemini } from '../src/lib/gemini';
import { computeCoverage, type InventorySkuInput } from '../src/lib/policy';
import { validateTriggerQuote } from '../src/lib/grounding';
import { restockStore } from '../src/lib/restock-store';

const cups: InventorySkuInput = {
  sku: 'CUPS-12OZ-500',
  name: '12oz Cups',
  category: 'Paper Goods & Packaging',
  avgDailySales: 1,
  leadTimeDays: 2,
  safetyStock: 1,
  onHand: 3,
  onOrder: 0,
  packSize: 1,
  lastPaidUnitPrice: 38,
};

describe('Ed25519 publicly verifiable receipts', () => {
  const payload = { poId: 'PO-1', totalPrice: 868, decision: 'ALLOW', lines: [{ sku: 'A', qty: 14 }] };

  it('signs and verifies with only the public key', () => {
    const r = signReceiptEd25519(payload);
    expect(r.algorithm).toBe('Ed25519');
    expect(verifyReceiptEd25519(r, getReceiptPublicKeyPem()).valid).toBe(true);
  });

  it('is deterministic across instances (same key) and key-order independent', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(getReceiptPublicKeyPem()).toBe(getReceiptPublicKeyPem());
  });

  it('detects any tampered field', () => {
    const r = signReceiptEd25519(payload);
    const tampered = { ...r, payload: { ...r.payload, totalPrice: 1200 } };
    const res = verifyReceiptEd25519(tampered);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('modified');
  });

  it('detects a forged signature even when the digest is recomputed', () => {
    const r = signReceiptEd25519(payload);
    const other = signReceiptEd25519({ ...payload, totalPrice: 1 });
    const forged = { ...r, signature: other.signature };
    expect(verifyReceiptEd25519(forged).valid).toBe(false);
  });
});

describe('AI daily spend cap with labelled replay', () => {
  beforeEach(() => {
    resetAiBudget();
    delete process.env.AI_DAILY_CALL_CAP;
  });

  it('stops consuming after the cap and reports capped', () => {
    process.env.AI_DAILY_CALL_CAP = '2';
    expect(tryConsumeAiCall()).toBe(true);
    expect(tryConsumeAiCall()).toBe(true);
    expect(tryConsumeAiCall()).toBe(false);
    expect(aiBudgetStatus()).toMatchObject({ used: 2, cap: 2, remaining: 0, capped: true });
  });

  it('rolls over on a new day', () => {
    process.env.AI_DAILY_CALL_CAP = '1';
    expect(tryConsumeAiCall(new Date('2026-11-12T10:00:00Z'))).toBe(true);
    expect(tryConsumeAiCall(new Date('2026-11-12T11:00:00Z'))).toBe(false);
    expect(tryConsumeAiCall(new Date('2026-11-13T00:01:00Z'))).toBe(true);
  });

  it('callGemini refuses to call the provider once capped', async () => {
    process.env.AI_DAILY_CALL_CAP = '0';
    await expect(callGemini('hi')).rejects.toThrow(/daily call cap/i);
  });
});

describe('Days-of-stock coverage', () => {
  it('reports days left and a pack-rounded two-week quantity', () => {
    const c = computeCoverage(cups, 14);
    expect(c.daysOfStockLeft).toBe(3);
    expect(c.coverageQty).toBe(11); // 14 needed - 3 on hand
  });

  it('respects in-transit stock (no duplicate coverage order)', () => {
    expect(computeCoverage({ ...cups, onOrder: 20 }, 14).coverageQty).toBe(0);
  });

  it('rounds to supplier pack size and MOQ', () => {
    expect(computeCoverage({ ...cups, packSize: 4 }, 14).coverageQty).toBe(12);
    expect(computeCoverage({ ...cups, packSize: 4, moq: 20 }, 14).coverageQty).toBe(20);
  });

  it('handles zero burn without dividing by zero', () => {
    const c = computeCoverage({ ...cups, avgDailySales: 0 }, 14);
    expect(c.daysOfStockLeft).toBeNull();
    expect(c.coverageQty).toBe(0);
  });
});

describe('Quoted trigger from the owner message', () => {
  const msg = "We're low on oat milk and 12oz cups";
  it('accepts a real quote (case/space insensitive)', () => {
    expect(validateTriggerQuote(msg, 'LOW ON  oat milk').valid).toBe(true);
  });
  it('rejects a quote the owner never wrote', () => {
    expect(validateTriggerQuote(msg, 'buy 500 espresso bags').valid).toBe(false);
  });
  it('rejects a missing quote', () => {
    expect(validateTriggerQuote(msg, undefined).valid).toBe(false);
  });
});

describe('Refund restores the budget', () => {
  beforeEach(() => restockStore.reset());

  function seedCaptured(poId: string, total: number, qty: number) {
    restockStore.savePurchaseOrder({
      id: poId, sku: 'ESPRESSO-5LB', name: 'Espresso', category: 'Coffee Beans', qty, unitPrice: total / qty,
      totalPrice: total, merchantName: 'RoastSupply Co', packSize: 1, verifiedMedianPrice: 63.25, lastPaidPrice: 60,
      decision: 'ALLOW', reasons: [], approvedByOwner: true, createdAt: new Date().toISOString(),
    });
    restockStore.saveClaim({
      poId, mandateId: 'm', status: 'CAPTURED', amount: total, currency: 'USD', paypalRequestIdCreate: 'x',
      contractHash: 'h', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    restockStore.spendSoFar += total;
    restockStore.updateOnOrder('ESPRESSO-5LB', qty);
  }

  it('frees budget and in-transit stock, and is idempotent', () => {
    const before = restockStore.spendSoFar;
    const onOrderBefore = restockStore.getSku('ESPRESSO-5LB')!.onOrder;
    seedCaptured('PO-REF-1', 868, 14);
    const res = restockStore.restoreBudgetForRefund('PO-REF-1');
    expect(res.restored).toBe(868);
    expect(restockStore.spendSoFar).toBe(before);
    expect(restockStore.getSku('ESPRESSO-5LB')!.onOrder).toBe(onOrderBefore);
    expect(restockStore.getClaim('PO-REF-1')!.status).toBe('REFUNDED');
    expect(restockStore.getLedger()[0].notes).toContain('PayPal refund API not invoked');
    expect(() => restockStore.restoreBudgetForRefund('PO-REF-1')).toThrow(/already refunded/);
  });

  it('refuses to refund an order that was never captured', () => {
    seedCaptured('PO-REF-2', 100, 2);
    const c = restockStore.getClaim('PO-REF-2')!;
    c.status = 'AWAITING_BUYER_APPROVAL';
    restockStore.saveClaim(c);
    expect(() => restockStore.restoreBudgetForRefund('PO-REF-2')).toThrow(/Only CAPTURED/);
  });
});
