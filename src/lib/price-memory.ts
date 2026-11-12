/**
 * Price memory: compare today's unit price with what the café last paid.
 * Pure and advisory: it never changes a policy decision, it only tells the owner "wait, this is pricey".
 */
export type PriceTrend = 'BELOW_LAST_PAID' | 'AT_LAST_PAID' | 'ABOVE_LAST_PAID' | 'NO_HISTORY';

export interface PriceMemory {
  trend: PriceTrend;
  /** Positive = more expensive than last paid. Null when there is no usable history. */
  deltaPct: number | null;
  /** Per-unit difference in USD (today - last paid), rounded to cents. */
  deltaUnitUsd: number | null;
  /** Total effect on this order in USD (negative = saving). */
  deltaOrderUsd: number | null;
  /** True when the price is more than `warnPct` above last paid. */
  warn: boolean;
  message: string;
}

export function computePriceMemory(
  unitPrice: number,
  lastPaidUnitPrice: number,
  qty: number,
  warnPct = 10,
): PriceMemory {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(lastPaidUnitPrice) || lastPaidUnitPrice <= 0 || unitPrice < 0) {
    return {
      trend: 'NO_HISTORY',
      deltaPct: null,
      deltaUnitUsd: null,
      deltaOrderUsd: null,
      warn: false,
      message: 'No previous price on record',
    };
  }
  const cents = (n: number) => Math.round(n * 100) / 100;
  const deltaUnitUsd = cents(unitPrice - lastPaidUnitPrice);
  const deltaPct = Math.round(((unitPrice - lastPaidUnitPrice) / lastPaidUnitPrice) * 1000) / 10;
  const deltaOrderUsd = cents(deltaUnitUsd * Math.max(0, qty));
  const trend: PriceTrend = deltaUnitUsd === 0 ? 'AT_LAST_PAID' : deltaUnitUsd < 0 ? 'BELOW_LAST_PAID' : 'ABOVE_LAST_PAID';
  const warn = deltaPct > warnPct;
  const message =
    trend === 'AT_LAST_PAID'
      ? 'Same as last paid'
      : trend === 'BELOW_LAST_PAID'
        ? `${Math.abs(deltaPct)}% below last paid (saves $${Math.abs(deltaOrderUsd).toFixed(2)} on this order)`
        : warn
          ? `${deltaPct}% above last paid: consider waiting (+$${deltaOrderUsd.toFixed(2)} on this order)`
          : `${deltaPct}% above last paid (+$${deltaOrderUsd.toFixed(2)} on this order)`;
  return { trend, deltaPct, deltaUnitUsd, deltaOrderUsd, warn, message };
}
