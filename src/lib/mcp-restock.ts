/**
 * RestockPilot read-only MCP surface (JSON-RPC 2.0).
 *
 * Law: an external agent may READ state and PROPOSE a reorder. It can never pay, capture,
 * approve, refund, payout, or edit the mandate. Proposals are returned, never persisted.
 */
import { restockStore } from '@/lib/restock-store';
import {
  computeReorder,
  computeCoverage,
  computeVerifiedPeerMedian,
  evaluateMandate,
  type CandidateOffer,
} from '@/lib/policy';
import { CHANNEL3_SEEDED_OFFERS } from '@/lib/channel3-seed-offers';
import { computeBaseUnitPrice } from '@/lib/units';

export const SERVER_NAME = 'RestockPilot Read-Only MCP';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const skuSchema = {
  type: 'object',
  properties: { sku: { type: 'string', description: 'Inventory SKU, e.g. ESPRESSO-5LB' } },
  required: ['sku'],
  additionalProperties: false,
};

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'get_mandate',
    description: 'Read the café owner spend mandate (budget, caps, allowed categories). Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_low_stock',
    description: 'List SKUs whose net inventory position is at or below the reorder point. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_quotes',
    description: 'List sourced offers for a SKU with the filtered verified peer median. Read-only.',
    inputSchema: skuSchema,
  },
  {
    name: 'propose_reorder',
    description:
      'Return a DRAFT reorder proposal with the policy decision. Nothing is saved, approved, or paid.',
    inputSchema: skuSchema,
  },
];

/** Substrings that must never appear in any exposed tool name. */
export const FORBIDDEN_MONEY_TOOLS = [
  'pay',
  'capture',
  'approve',
  'refund',
  'payout',
  'update_mandate',
  'create_order',
  'void',
  'transfer',
  'execute',
];

export function isForbiddenTool(name: string): boolean {
  const n = name.toLowerCase();
  return FORBIDDEN_MONEY_TOOLS.some((f) => n.includes(f));
}

function offersFor(sku: string): CandidateOffer[] {
  return CHANNEL3_SEEDED_OFFERS[sku] ?? [];
}

function requireSku(args: Record<string, unknown> | undefined): string {
  const sku = args?.sku;
  if (typeof sku !== 'string' || !restockStore.getSku(sku)) {
    throw new Error(`Unknown or missing sku '${String(sku)}'`);
  }
  return sku;
}

export function callReadOnlyTool(name: string, args?: Record<string, unknown>): unknown {
  switch (name) {
    case 'get_mandate':
      return {
        mandate: restockStore.getMandate(),
        spendSoFar: restockStore.spendSoFar,
      };

    case 'get_low_stock': {
      const rows = restockStore.getInventory().map((item) => ({ item, calc: computeReorder(item) }));
      return {
        lowStockItems: rows
          .filter((r) => r.calc.needsReorder)
          .map((r) => ({
            sku: r.item.sku,
            name: r.item.name,
            onHand: r.item.onHand,
            onOrder: r.item.onOrder,
            inventoryPosition: r.calc.inventoryPosition,
            reorderPoint: r.calc.reorderPoint,
            suggestedQty: r.calc.suggestedQty,
            daysOfStockLeft: computeCoverage(r.item).daysOfStockLeft,
            twoWeekCoverageQty: computeCoverage(r.item, 14).coverageQty,
          })),
        totalDuplicateSpendPrevented: Number(
          rows.reduce((sum, r) => sum + (r.calc.duplicateOrderPreventedSpend ?? 0), 0).toFixed(2)
        ),
      };
    }

    case 'get_quotes': {
      const sku = requireSku(args);
      const offers = offersFor(sku);
      return {
        sku,
        verifiedPeerMedianPrice: computeVerifiedPeerMedian(offers),
        offers: offers.map((o) => ({
          id: o.id,
          merchantName: o.merchantName,
          unitPrice: o.unitPrice,
          condition: o.condition,
          inStock: o.inStock,
          sameProduct: o.sameProduct,
          costPerBaseUnit: computeBaseUnitPrice(o.unitPrice, o.title).formattedUnitPrice,
        })),
      };
    }

    case 'propose_reorder': {
      const sku = requireSku(args);
      const item = restockStore.getSku(sku)!;
      const calc = computeReorder(item);
      if (!calc.needsReorder || calc.suggestedQty <= 0) {
        return { sku, proposal: null, reason: 'Net inventory position is above the reorder point' };
      }
      const offers = offersFor(sku);
      const median = computeVerifiedPeerMedian(offers);
      const offer =
        offers.find((o) => o.sameProduct && o.inStock && o.unitPrice >= 0.65 * median) ??
        offers.find((o) => o.sameProduct && o.inStock);
      if (!offer) return { sku, proposal: null, reason: 'No verified in-stock offer found' };
      const totalPrice = Number((offer.unitPrice * calc.suggestedQty).toFixed(2));
      const policy = evaluateMandate(
        restockStore.getMandate(),
        restockStore.spendSoFar,
        { ...offer, totalPrice },
        median
      );
      return {
        sku,
        draft: true,
        persisted: false,
        proposal: {
          qty: calc.suggestedQty,
          merchantName: offer.merchantName,
          unitPrice: offer.unitPrice,
          totalPrice,
          verifiedPeerMedianPrice: median,
        },
        policy: { decision: policy.decision, reasons: policy.reasons },
        note: 'Owner approval in the RestockPilot UI is required before any PayPal action.',
      };
    }

    default:
      throw new Error(`Unknown tool '${name}'`);
  }
}
