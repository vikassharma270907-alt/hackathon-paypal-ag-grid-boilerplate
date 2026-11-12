import { describe, it, expect } from 'vitest';
import { computePriceMemory } from '../src/lib/price-memory';

describe('price memory', () => {
  it('reports a saving when below last paid', () => {
    const m = computePriceMemory(62, 64, 14);
    expect(m).toMatchObject({ trend: 'BELOW_LAST_PAID', deltaUnitUsd: -2, deltaOrderUsd: -28, deltaPct: -3.1, warn: false });
    expect(m.message).toContain('saves $28.00');
  });

  it('warns only when more than the threshold above last paid', () => {
    expect(computePriceMemory(70.4, 64, 1).warn).toBe(false); // exactly +10%
    const high = computePriceMemory(72, 64, 2);
    expect(high).toMatchObject({ trend: 'ABOVE_LAST_PAID', warn: true, deltaOrderUsd: 16 });
    expect(high.message).toContain('consider waiting');
  });

  it('handles equal price and missing history without guessing', () => {
    expect(computePriceMemory(10, 10, 5).trend).toBe('AT_LAST_PAID');
    for (const last of [0, -1, NaN]) {
      expect(computePriceMemory(10, last, 5)).toMatchObject({ trend: 'NO_HISTORY', deltaPct: null, warn: false });
    }
    expect(computePriceMemory(NaN, 10, 5).trend).toBe('NO_HISTORY');
  });
});
