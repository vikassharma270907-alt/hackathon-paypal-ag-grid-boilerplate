import { describe, it, expect } from 'vitest';
import { assessShelfLife } from '../src/lib/shelf-life';
import { computeReorder, type InventorySkuInput } from '../src/lib/policy';

const base: InventorySkuInput = {
  sku: 'MILK-FRESH',
  name: 'Fresh milk',
  category: 'Dairy',
  avgDailySales: 2,
  leadTimeDays: 2,
  safetyStock: 2,
  onHand: 0,
  onOrder: 0,
  packSize: 6,
  moq: 6,
  lastPaidUnitPrice: 10,
  shelfLifeDays: 7,
};

describe('shelf-life guard', () => {
  it('ignores items with no freshness window', () => {
    const r = assessShelfLife({ ...base, shelfLifeDays: undefined }, 100);
    expect(r).toMatchObject({ status: 'NOT_PERISHABLE', allowedQty: 100, wasteUnitsAvoided: 0 });
  });

  it('passes a quantity that sells inside the window', () => {
    // d=2, 7d => 14 sellable, rounded down to packs of 6 => 12
    const r = assessShelfLife(base, 12);
    expect(r).toMatchObject({ status: 'OK', allowedQty: 12, wasteSpendAvoidedUsd: 0 });
  });

  it('trims an over-order to whole sellable packs and prices the waste', () => {
    const r = assessShelfLife(base, 30);
    expect(r.status).toBe('TRIMMED');
    expect(r.allowedQty).toBe(12);
    expect(r.wasteUnitsAvoided).toBe(18);
    expect(r.wasteSpendAvoidedUsd).toBe(180);
  });

  it('counts existing stock as sold first (FIFO) so the new batch has less room', () => {
    // position 10, arrives after 4 units sold -> 6 left at arrival; sellable = 14 - 6 = 8 -> 6
    const r = assessShelfLife({ ...base, onHand: 10 }, 12);
    expect(r.status).toBe('TRIMMED');
    expect(r.allowedQty).toBe(6);
  });

  it('holds when the sellable amount is below the supplier MOQ', () => {
    const r = assessShelfLife({ ...base, onHand: 40 }, 12);
    expect(r).toMatchObject({ status: 'HOLD', allowedQty: 0, wasteUnitsAvoided: 12 });
  });

  it('never allows more than requested and sanitises bad input', () => {
    expect(assessShelfLife(base, NaN).allowedQty).toBe(0);
    expect(assessShelfLife(base, -5).requestedQty).toBe(0);
    const r = assessShelfLife(base, 6);
    expect(r.allowedQty).toBeLessThanOrEqual(6);
  });

  it('composes with computeReorder without changing the base reorder math', () => {
    const calc = computeReorder({ ...base, onHand: 1 });
    const r = assessShelfLife({ ...base, onHand: 1 }, calc.suggestedQty);
    expect(calc.needsReorder).toBe(true);
    expect(r.allowedQty).toBeLessThanOrEqual(calc.suggestedQty);
  });
});
