/**
 * RestockPilot — Shelf-Life Guard (lib/shelf-life.ts)
 *
 * Strict invariant: ZERO I/O, 100% deterministic pure functions.
 *
 * Problem: reorder math (s, S) and 14-day coverage ignore spoilage. A café can buy a
 * "mathematically correct" quantity of a perishable that it cannot sell before the
 * batch goes stale. This guard caps the order at what can actually be sold inside the
 * freshness window and prices the waste it prevented.
 *
 * Model (FIFO): units arrive after `leadTimeDays`. Stock still on hand at arrival is sold
 * first. The new batch can then only sell for the rest of its freshness window.
 *   remainingAtArrival = max(0, position - d * L)
 *   sellable           = max(0, d * freshnessDays - remainingAtArrival)
 */
import type { InventorySkuInput } from '@/lib/policy';

export type ShelfLifeStatus =
  | 'NOT_PERISHABLE' // no freshness window recorded; guard does not apply
  | 'OK'             // full requested quantity can be sold in time
  | 'TRIMMED'        // quantity reduced to the sellable, pack-rounded amount
  | 'HOLD';          // sellable amount is below the supplier MOQ; do not order

export interface ShelfLifeAssessment {
  sku: string;
  status: ShelfLifeStatus;
  freshnessDays: number | null;
  requestedQty: number;
  /** Quantity the policy allows after the guard (== requestedQty unless TRIMMED/HOLD). */
  allowedQty: number;
  /** Units of the request that would likely expire unsold. */
  wasteUnitsAvoided: number;
  /** wasteUnitsAvoided * unit price, in USD (cents-rounded). */
  wasteSpendAvoidedUsd: number;
  reason: string;
}

const round2 = (n: number) => Number(n.toFixed(2));

export function assessShelfLife(
  item: InventorySkuInput,
  requestedQty: number,
  unitPrice: number = item.lastPaidUnitPrice
): ShelfLifeAssessment {
  const requested = Math.max(0, Math.floor(Number.isFinite(requestedQty) ? requestedQty : 0));
  const base = { sku: item.sku, requestedQty: requested };

  const freshness = item.shelfLifeDays;
  if (freshness === undefined || freshness === null || !Number.isFinite(freshness) || freshness <= 0) {
    return {
      ...base,
      status: 'NOT_PERISHABLE',
      freshnessDays: null,
      allowedQty: requested,
      wasteUnitsAvoided: 0,
      wasteSpendAvoidedUsd: 0,
      reason: 'No freshness window recorded; shelf-life guard not applicable',
    };
  }

  const d = Math.max(0, item.avgDailySales);
  const L = Math.max(0, item.leadTimeDays);
  const packSize = Math.max(1, item.packSize ?? 1);
  const moq = Math.max(1, item.moq ?? 1);
  const position = Math.max(0, item.onHand + item.onOrder - (item.committed ?? 0));

  const remainingAtArrival = Math.max(0, position - d * L);
  const sellableRaw = Math.max(0, d * freshness - remainingAtArrival);
  // Round DOWN to whole supplier packs so we never order into expected waste.
  const sellablePacked = Math.floor(sellableRaw / packSize) * packSize;

  if (requested <= sellablePacked) {
    return {
      ...base,
      status: 'OK',
      freshnessDays: freshness,
      allowedQty: requested,
      wasteUnitsAvoided: 0,
      wasteSpendAvoidedUsd: 0,
      reason: `Requested ${requested} fits the ${freshness}d freshness window (sellable ${sellablePacked})`,
    };
  }

  const wasteUnits = requested - Math.max(0, sellablePacked);
  if (sellablePacked < moq) {
    return {
      ...base,
      status: 'HOLD',
      freshnessDays: freshness,
      allowedQty: 0,
      wasteUnitsAvoided: requested,
      wasteSpendAvoidedUsd: round2(requested * unitPrice),
      reason: `Only ${sellablePacked} sellable within ${freshness}d, below MOQ ${moq}; ordering would waste stock`,
    };
  }

  return {
    ...base,
    status: 'TRIMMED',
    freshnessDays: freshness,
    allowedQty: sellablePacked,
    wasteUnitsAvoided: wasteUnits,
    wasteSpendAvoidedUsd: round2(wasteUnits * unitPrice),
    reason: `Trimmed ${requested} to ${sellablePacked}: at ${d}/day only ${sellablePacked} sell within ${freshness}d`,
  };
}
