import crypto from 'node:crypto';
import type { InventorySkuInput, Mandate, PolicyDecision } from './policy';
import type { Basket } from './basket';

export type ClaimStatus =
  | 'DRAFT'
  | 'ORDER_CREATING'
  | 'AWAITING_BUYER_APPROVAL'
  | 'CAPTURE_PENDING'
  | 'CAPTURED'
  | 'UNKNOWN'
  | 'RECONCILED'
  | 'FAILED'
  | 'DECLINED'
  | 'REFUNDED';

export interface RestockPurchaseOrder {
  id: string; // e.g. PO-SUNRISE-101
  sku: string;
  name: string;
  category: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  merchantName: string;
  merchantUrl?: string;
  packSize: number;
  verifiedMedianPrice: number;
  lastPaidPrice: number;
  decision: PolicyDecision;
  reasons: string[];
  approvedByOwner: boolean;
  approvedAt?: string;
  triggerQuote?: string;
  costPerBaseUnit?: string;
  daysRemaining?: number;
  receiptSignature?: string;
  createdAt: string;
}

export interface RestockClaim {
  poId: string;
  mandateId: string;
  status: ClaimStatus;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalRefundId?: string;
  approveUrl?: string;
  paypalFee?: string;
  amount: number;
  currency: string;
  paypalRequestIdCreate: string;
  paypalRequestIdCapture?: string;
  webhookEventId?: string;
  contractHash: string; // sha256(mandateId + ":" + poId)
  createdAt: string;
  updatedAt: string;
  errorDetails?: string;
}

export interface LedgerEntry {
  id: string;
  timestamp: string;
  step: string;
  sku: string;
  merchant: string;
  qty: number;
  total: number;
  savingsVsMedian: number;
  decision: PolicyDecision;
  status: 'PENDING' | 'ALLOW' | 'ASK' | 'BLOCK' | 'CAPTURED' | 'WEBHOOK_VERIFIED' | 'UNKNOWN' | 'RECONCILED' | 'REFUNDED';
  // (basket flows reuse PENDING/CAPTURED/UNKNOWN)
  paypalOrderId?: string;
  paypalCaptureId?: string;
  webhookEventId?: string;
  idempotencyHash: string;
  notes?: string;
}

export function computeSha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export const SEEDED_MANDATE: Mandate = {
  id: "MANDATE-SUNRISE-2026",
  active: true,
  expiresAt: "2027-12-31T23:59:59Z",
  allowedCategories: [
    "Coffee Beans",
    "Dairy & Plant Milk",
    "Paper Goods & Packaging",
    "Syrups & Flavoring",
    "Espresso Parts",
  ],
  maxPerOrder: 1500.0,
  monthlyBudget: 4000.0,
  askFirstOver: 150.0,
  conditionNewOnly: true,
  strictNewBlock: true, // true for consumable food/beverage
  preferredSellers: [
    "RoastSupply Co",
    "OatDistribution Direct",
    "EcoPackaging Direct",
    "BaristaTools USA",
  ],
};

export const SEEDED_INVENTORY: Record<string, InventorySkuInput> = {
  "OAT-MILK-6PK": {
    sku: "OAT-MILK-6PK",
    name: "Barista Oat Milk (6x32oz Case)",
    category: "Dairy & Plant Milk",
    avgDailySales: 4.5,
    leadTimeDays: 3,
    safetyStock: 6,
    reviewPeriodDays: 7,
    onHand: 12,
    onOrder: 12, // 12 cases in-transit from prior PO!
    committed: 0,
    packSize: 1,
    moq: 1,
    lastPaidUnitPrice: 21.5,
  },
  "ESPRESSO-5LB": {
    sku: "ESPRESSO-5LB",
    name: "Colombia Espresso Whole Bean (5lb)",
    category: "Coffee Beans",
    avgDailySales: 1.2,
    leadTimeDays: 5,
    safetyStock: 3,
    reviewPeriodDays: 7,
    onHand: 4,
    onOrder: 0,
    committed: 0,
    packSize: 1,
    moq: 1,
    lastPaidUnitPrice: 64.0,
    shelfLifeDays: 21, // roasted beans: peak-freshness window (demo assumption)
  },
  "CUPS-12OZ-500": {
    sku: "CUPS-12OZ-500",
    name: "12oz Hot Paper Cups (Sleeve of 500, Pack of 2)",
    category: "Paper Goods & Packaging",
    avgDailySales: 0.8,
    leadTimeDays: 4,
    safetyStock: 2,
    reviewPeriodDays: 7,
    onHand: 3,
    onOrder: 0,
    committed: 0,
    packSize: 2,
    moq: 2,
    lastPaidUnitPrice: 38.0,
  },
  "BURR-GRINDER-SET": {
    sku: "BURR-GRINDER-SET",
    name: "Commercial 83mm Flat Espresso Burrs",
    category: "Espresso Parts",
    avgDailySales: 0.1,
    leadTimeDays: 5,
    safetyStock: 1,
    reviewPeriodDays: 14,
    onHand: 1,
    onOrder: 0,
    committed: 0,
    packSize: 1,
    moq: 1,
    lastPaidUnitPrice: 145.0,
  },
};

class RestockPilotStore {
  mandate: Mandate = { ...SEEDED_MANDATE };
  inventory: Map<string, InventorySkuInput> = new Map();
  purchaseOrders: Map<string, RestockPurchaseOrder> = new Map();
  claims: Map<string, RestockClaim> = new Map();
  baskets: Map<string, Basket> = new Map();
  ledger: LedgerEntry[] = [];
  processedWebhookIds: Set<string> = new Set();
  spendSoFar: number = 850.0; // Current cycle spend before new orders

  constructor() {
    this.reset();
  }

  reset() {
    this.mandate = { ...SEEDED_MANDATE };
    this.inventory.clear();
    for (const [sku, item] of Object.entries(SEEDED_INVENTORY)) {
      this.inventory.set(sku, { ...item });
    }
    this.purchaseOrders.clear();
    this.claims.clear();
    this.baskets.clear();
    this.ledger = [];
    this.processedWebhookIds.clear();
    this.spendSoFar = 850.0;

    // Seed baseline ledger entry (illustrative sample: its ids are placeholders, not a live PayPal run)
    this.ledger.push({
      id: "LEDGER-INIT-001",
      timestamp: "2026-11-10T14:32:00Z",
      step: "SAMPLE (seeded): PO Approved & Captured",
      sku: "OAT-MILK-6PK",
      merchant: "OatDistribution Direct",
      qty: 12,
      total: 258.0,
      savingsVsMedian: 18.0,
      decision: "ALLOW",
      status: "CAPTURED",
      paypalOrderId: "5O190127TN364715T",
      paypalCaptureId: "78G12345TN987654K",
      webhookEventId: "WH-20261110-884102",
      idempotencyHash: computeSha256("PO-OAT-INIT:create:25800"),
      notes: "SEEDED demo row (placeholder PayPal IDs, not a live run). Prior replenishment cycle in-transit (covers current ROP)",
    });
  }

  getMandate(): Mandate {
    return this.mandate;
  }

  getInventory(): InventorySkuInput[] {
    return Array.from(this.inventory.values());
  }

  getSku(sku: string): InventorySkuInput | undefined {
    return this.inventory.get(sku);
  }

  updateOnOrder(sku: string, qtyToAdd: number) {
    const item = this.inventory.get(sku);
    if (item) {
      item.onOrder = Math.max(0, item.onOrder + qtyToAdd);
      this.inventory.set(sku, item);
    }
  }

  savePurchaseOrder(po: RestockPurchaseOrder) {
    this.purchaseOrders.set(po.id, po);
  }

  getPurchaseOrder(id: string): RestockPurchaseOrder | undefined {
    return this.purchaseOrders.get(id);
  }

  saveClaim(claim: RestockClaim) {
    this.claims.set(claim.poId, claim);
  }

  getClaim(poId: string): RestockClaim | undefined {
    return this.claims.get(poId);
  }

  addLedgerEntry(entry: LedgerEntry) {
    this.ledger.unshift(entry);
  }

  /**
   * Budget already committed to payments that exist at PayPal (or in simulation) but are not yet
   * captured: open single-order claims plus open basket authorization holds. Spend is only counted
   * at capture, so budget checks must add this, or several unpaid orders could together exceed the
   * monthly budget. Pass the caller's own PO / basket id to exclude it from the reservation.
   */
  getReservedSpend(exclude: { poId?: string; basketId?: string } = {}): number {
    const OPEN_CLAIM = new Set<ClaimStatus>(['ORDER_CREATING', 'AWAITING_BUYER_APPROVAL', 'CAPTURE_PENDING', 'UNKNOWN']);
    const CLOSED_BASKET = new Set(['SETTLED', 'VOIDED', 'FAILED']);
    let cents = 0;
    for (const claim of this.claims.values()) {
      if (claim.poId === exclude.poId || !OPEN_CLAIM.has(claim.status)) continue;
      cents += Math.round(claim.amount * 100);
    }
    for (const basket of this.baskets.values()) {
      if (basket.id === exclude.basketId || CLOSED_BASKET.has(basket.status)) continue;
      cents += basket.totalCents;
    }
    return cents / 100;
  }

  /**
   * Refund restores the budget: a refunded captured order frees the period budget and in-transit
   * stock immediately. LOCAL ledger effect only; the PayPal Payments v2 refund call itself is not
   * made here (roadmap) and the ledger note says so, so it is never presented as a PayPal refund.
   * Idempotent: a second call throws instead of double-restoring.
   */
  restoreBudgetForRefund(poId: string, reason = 'Owner-initiated refund', refundRef?: string): { restored: number; spendSoFar: number } {
    const claim = this.claims.get(poId);
    const po = this.purchaseOrders.get(poId);
    if (!claim || !po) throw new Error(`No captured order found for ${poId}`);
    if (claim.status === 'REFUNDED') throw new Error(`Order ${poId} was already refunded`);
    if (claim.status !== 'CAPTURED') throw new Error(`Only CAPTURED orders can restore budget (status: ${claim.status})`);

    const restored = Math.min(po.totalPrice, this.spendSoFar);
    this.spendSoFar = Number((this.spendSoFar - restored).toFixed(2));
    this.updateOnOrder(po.sku, -po.qty);
    claim.status = 'REFUNDED';
    claim.updatedAt = new Date().toISOString();
    this.claims.set(poId, claim);
    this.addLedgerEntry({
      id: `LEDGER-${computeSha256(`${poId}:refund`).slice(0, 8).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      step: 'Refund restored budget',
      sku: po.sku,
      merchant: po.merchantName,
      qty: po.qty,
      total: -restored,
      savingsVsMedian: 0,
      decision: po.decision,
      status: 'REFUNDED',
      paypalOrderId: claim.paypalOrderId,
      paypalCaptureId: claim.paypalCaptureId,
      idempotencyHash: computeSha256(`${poId}:refund`),
      notes: refundRef
        ? `${reason}. PayPal refund ${refundRef}; budget restored.`
        : `${reason}. Local budget restored; PayPal refund API not invoked.`,
    });
    return { restored, spendSoFar: this.spendSoFar };
  }  getLedger(): LedgerEntry[] {
    return this.ledger;
  }
}

export const restockStore = new RestockPilotStore();

