/**
 * Restock cycle: net-inventory reorder math -> sourced offers -> 9-rule policy gate -> draft purchase orders.
 *
 * Shared by the owner's "Run Café Restock Cycle" button and the scheduled morning run. This module NEVER
 * calls PayPal and never captures money; it only creates draft purchase orders in the store.
 */
import { restockStore, computeSha256, type RestockPurchaseOrder } from '@/lib/restock-store';
import {
  computeReorder,
  computeVerifiedPeerMedian,
  evaluateMandate,
  type CandidateOffer,
} from '@/lib/policy';
import { computeBaseUnitPrice } from '@/lib/units';
import { signDocketReceipt } from '@/lib/receipt-verifier';
import { CHANNEL3_SEEDED_OFFERS } from '@/lib/channel3-seed-offers';

export interface RestockCycleOptions {
  /**
   * true  = owner pressed the button: policy ALLOW orders are pre-approved (existing behaviour).
   * false = unattended morning run: every draft waits for an explicit owner approval, even ALLOW.
   */
  autoApproveAllow: boolean;
  /** Skip a SKU that already has an open (not declined / failed / refunded) draft or in-flight order. Makes reruns idempotent. */
  skipSkusWithOpenOrder?: boolean;
}

export interface RestockCycleResult {
  orders: RestockPurchaseOrder[];
  skipped: Array<{ sku: string; reason: string }>;
}

const CLOSED_STATUSES = new Set(['DECLINED', 'FAILED', 'REFUNDED']);

function hasOpenOrder(sku: string): boolean {
  for (const po of restockStore.purchaseOrders.values()) {
    if (po.sku !== sku) continue;
    const claim = restockStore.getClaim(po.id);
    if (claim && CLOSED_STATUSES.has(claim.status)) continue;
    return true;
  }
  return false;
}

export function runRestockCycle(options: RestockCycleOptions): RestockCycleResult {
  const inventory = restockStore.getInventory();
  const mandate = restockStore.getMandate();
  const orders: RestockPurchaseOrder[] = [];
  const skipped: Array<{ sku: string; reason: string }> = [];

  for (const item of inventory) {
    const calc = computeReorder(item);
    if (!calc.needsReorder || calc.suggestedQty <= 0) {
      skipped.push({
        sku: item.sku,
        reason: `Net position ${calc.inventoryPosition} is above reorder point ${calc.reorderPoint}`,
      });
      continue;
    }
    if (options.skipSkusWithOpenOrder && hasOpenOrder(item.sku)) {
      skipped.push({ sku: item.sku, reason: 'An open order for this SKU already exists' });
      continue;
    }

    const candidateOffers = CHANNEL3_SEEDED_OFFERS[item.sku] || [];
    const verifiedMedian = computeVerifiedPeerMedian(candidateOffers);

    // Prefer a same-product, in-stock offer that is not implausibly cheap (counterfeit/expired trap).
    const selectedOffer =
      candidateOffers.find((o) => o.sameProduct && o.inStock && o.unitPrice >= 0.65 * verifiedMedian) ||
      candidateOffers.find((o) => o.sameProduct && o.inStock) ||
      candidateOffers[0];

    if (!selectedOffer) {
      skipped.push({ sku: item.sku, reason: 'No sourced offer available' });
      continue;
    }

    const orderTotal = Number((selectedOffer.unitPrice * calc.suggestedQty).toFixed(2));
    const candidateToEval: CandidateOffer = { ...selectedOffer, totalPrice: orderTotal };
    const policyResult = evaluateMandate(mandate, restockStore.spendSoFar, candidateToEval, verifiedMedian);

    const unitEconomics = computeBaseUnitPrice(selectedOffer.unitPrice, selectedOffer.title);
    const daysRemaining = item.avgDailySales > 0 ? Math.round(item.onHand / item.avgDailySales) : 0;
    const triggerQuote = `low on ${item.name.toLowerCase()} (stock: ${item.onHand}, daily burn: ${item.avgDailySales})`;

    const signedReceipt = signDocketReceipt({
      poId: `PO-${item.sku}-${Date.now().toString(36).toUpperCase()}`,
      sku: item.sku,
      orderTotal,
      approvedQty: calc.suggestedQty,
      unitPrice: selectedOffer.unitPrice,
      verifiedMedianPrice: verifiedMedian,
      status: policyResult.decision,
      checksSummary: policyResult.reasons,
      contractHash: computeSha256(`${mandate.id}:PO-${item.sku}`),
    });

    const po: RestockPurchaseOrder = {
      id: signedReceipt.poId,
      sku: item.sku,
      name: item.name,
      category: item.category,
      qty: calc.suggestedQty,
      unitPrice: selectedOffer.unitPrice,
      totalPrice: orderTotal,
      merchantName: selectedOffer.merchantName,
      merchantUrl: selectedOffer.url,
      packSize: item.packSize || 1,
      verifiedMedianPrice: verifiedMedian,
      lastPaidPrice: item.lastPaidUnitPrice,
      decision: policyResult.decision,
      reasons: policyResult.reasons,
      approvedByOwner: options.autoApproveAllow && policyResult.decision === 'ALLOW',
      triggerQuote,
      costPerBaseUnit: unitEconomics.formattedUnitPrice,
      daysRemaining,
      receiptSignature: signedReceipt.signature,
      createdAt: new Date().toISOString(),
    };

    restockStore.savePurchaseOrder(po);
    orders.push(po);
  }

  return { orders, skipped };
}
