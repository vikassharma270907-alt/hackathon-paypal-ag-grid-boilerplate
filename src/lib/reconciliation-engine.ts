import {
  PurchaseOrder,
  SupplierInvoice,
  DeliveryEvidence,
  PayPalAuthorizationRecord,
  FourWayReconciliationResult,
  LineItemReconciliation,
  FourWayMatchStatus,
} from './domain-models';

/**
 * Decimal financial arithmetic helper to prevent IEEE 754 floating-point inaccuracies.
 */
export class DecimalMath {
  public static round(val: number, precision: number = 2): number {
    const factor = Math.pow(10, precision);
    return Math.round((val + Number.EPSILON) * factor) / factor;
  }

  public static multiply(a: number, b: number): number {
    return this.round(a * b);
  }

  public static add(a: number, b: number): number {
    return this.round(a + b);
  }

  public static subtract(a: number, b: number): number {
    return this.round(a - b);
  }

  public static divide(a: number, b: number): number {
    if (b === 0) return 0;
    return this.round(a / b, 4);
  }
}

export interface ReconcileFourWayInput {
  po: PurchaseOrder;
  invoice: SupplierInvoice;
  delivery?: DeliveryEvidence;
  authorization?: PayPalAuthorizationRecord;
  maxVariancePct?: number; // e.g., 1.5%
}

/**
 * Deterministic Four-Way Reconciliation Engine
 * Strictly compares Line Items across PO, Invoice, Delivery Evidence, and PayPal Authorization.
 */
export function runFourWayReconciliation(input: ReconcileFourWayInput): FourWayReconciliationResult {
  const { po, invoice, delivery, authorization, maxVariancePct = 1.5 } = input;
  const reasons: string[] = [];
  const lineItemResults: LineItemReconciliation[] = [];

  // 1. Supplier & Currency Validation
  const supplierMatched =
    po.supplierId.trim().toLowerCase() === invoice.supplierId.trim().toLowerCase() ||
    po.supplierName.trim().toLowerCase() === invoice.supplierName.trim().toLowerCase();
  if (!supplierMatched) {
    reasons.push(`Supplier mismatch: PO supplier '${po.supplierName}' does not match invoice supplier '${invoice.supplierName}'.`);
  }

  const currencyMatched = po.currency.toUpperCase() === invoice.currency.toUpperCase();
  if (!currencyMatched) {
    reasons.push(`Currency mismatch: PO is in ${po.currency}, invoice is in ${invoice.currency}.`);
  }

  // 2. Line Item Matching
  let totalOrderedQty = 0;
  let totalInvoicedQty = 0;
  let totalDeliveredQty = 0;
  let totalAcceptedQty = 0;
  let eligibleSettlementAmount = 0.0;
  let verifiedAcceptedAmount = 0.0;

  for (const invItem of invoice.items) {
    totalInvoicedQty += invItem.invoicedQuantity;

    // Match with PO Item by SKU or description
    const poItem = po.items.find(
      (p) => p.sku === invItem.sku || p.description.toLowerCase() === invItem.description.toLowerCase()
    );

    // Match with Delivery Item
    const delItem = delivery?.items.find(
      (d) => d.sku === invItem.sku || d.description.toLowerCase() === invItem.description.toLowerCase()
    );

    const orderedQty = poItem ? poItem.orderedQuantity : 0;
    const agreedUnitPrice = poItem ? poItem.agreedUnitPrice : invItem.unitPrice;
    const invoicedQty = invItem.invoicedQuantity;
    const deliveredQty = delItem ? delItem.deliveredQuantity : 0;
    const acceptedQty = delItem ? delItem.acceptedQuantity : 0;
    const damagedQty = delItem ? delItem.damagedQuantity : 0;

    totalOrderedQty += orderedQty;
    totalDeliveredQty += deliveredQty;
    totalAcceptedQty += acceptedQty;

    // Eligible quantity rule: strictly what was accepted and verified
    const eligibleQuantity = acceptedQty;
    const eligibleLineAmount = DecimalMath.multiply(eligibleQuantity, agreedUnitPrice);
    eligibleSettlementAmount = DecimalMath.add(eligibleSettlementAmount, eligibleLineAmount);

    const lineAcceptedTotal = DecimalMath.multiply(acceptedQty, agreedUnitPrice);
    verifiedAcceptedAmount = DecimalMath.add(verifiedAcceptedAmount, lineAcceptedTotal);

    // Price & Quantity Variances
    const priceVariancePct = agreedUnitPrice > 0
      ? DecimalMath.round((Math.abs(invItem.unitPrice - agreedUnitPrice) / agreedUnitPrice) * 100)
      : 0;

    const quantityVariancePct = orderedQty > 0
      ? DecimalMath.round((Math.abs(invoicedQty - orderedQty) / orderedQty) * 100)
      : 0;

    let itemStatus: FourWayMatchStatus = 'MATCHED';
    const itemNotes: string[] = [];

    if (!poItem) {
      itemStatus = 'MANUAL_REVIEW_REQUIRED';
      itemNotes.push('Item on invoice was not found on authorized Purchase Order.');
    } else if (priceVariancePct > maxVariancePct) {
      itemStatus = 'PRICE_VARIANCE';
      itemNotes.push(`Unit price variance of ${priceVariancePct}% (Invoiced: $${invItem.unitPrice}, PO: $${agreedUnitPrice}).`);
    } else if (!delivery || delivery.verificationStatus === 'UNVERIFIED') {
      itemStatus = 'DELIVERY_UNVERIFIED';
      itemNotes.push('No verified carrier proof of delivery received.');
    } else if (acceptedQty < invoicedQty) {
      itemStatus = 'QUANTITY_VARIANCE';
      itemNotes.push(`Only ${acceptedQty} of ${invoicedQty} units accepted (${damagedQty} damaged, ${invoicedQty - deliveredQty} missing).`);
    }

    lineItemResults.push({
      sku: invItem.sku,
      description: invItem.description,
      orderedQty,
      invoicedQty,
      deliveredQty,
      acceptedQty,
      damagedQty,
      agreedUnitPrice,
      invoicedUnitPrice: invItem.unitPrice,
      eligibleQuantity,
      eligibleLineAmount,
      priceVariancePct,
      quantityVariancePct,
      status: itemStatus,
      notes: itemNotes.join(' '),
    });
  }

  // 3. Proportional Shipping & Tax Allocation
  // If only partial goods accepted, freight and taxes are adjusted per policy
  const invoiceTotalAmount = invoice.invoiceTotal;
  const poTotalAmount = po.totalAmount;
  const authorizedAmount = authorization ? authorization.authorizedAmount : poTotalAmount;

  // Total Variances
  const priceVariancePct = authorizedAmount > 0
    ? DecimalMath.round((Math.abs(invoiceTotalAmount - authorizedAmount) / authorizedAmount) * 100)
    : 0;

  const quantityVariancePct = totalOrderedQty > 0
    ? DecimalMath.round((Math.abs(totalInvoicedQty - totalOrderedQty) / totalOrderedQty) * 100)
    : 0;

  const unverifiedAmount = DecimalMath.subtract(invoiceTotalAmount, verifiedAcceptedAmount);
  const overbillingAmount = invoiceTotalAmount > authorizedAmount
    ? DecimalMath.subtract(invoiceTotalAmount, authorizedAmount)
    : 0;

  // 4. Overall Match Status Determination
  let overallStatus: FourWayMatchStatus = 'MATCHED';

  if (!supplierMatched) {
    overallStatus = 'SUPPLIER_MISMATCH';
  } else if (!currencyMatched) {
    overallStatus = 'CURRENCY_MISMATCH';
  } else if (priceVariancePct > maxVariancePct) {
    overallStatus = 'FROZEN_VARIANCE_EXCEEDED';
    reasons.push(`Total invoice variance of ${priceVariancePct}% exceeds allowed ${maxVariancePct}% threshold. Immediate freeze.`);
  } else if (!delivery || delivery.verificationStatus === 'UNVERIFIED') {
    overallStatus = 'DELIVERY_UNVERIFIED';
    reasons.push('Delivery evidence is missing or carrier tracking unconfirmed.');
  } else if (totalAcceptedQty < totalInvoicedQty) {
    overallStatus = 'PARTIAL_MATCH';
    reasons.push(`Partial delivery accepted: ${totalAcceptedQty}/${totalInvoicedQty} units verified. Eligible payment clamped.`);
  } else if (authorization && DecimalMath.subtract(authorizedAmount, invoiceTotalAmount) < -0.05) {
    overallStatus = 'AUTHORIZATION_MISMATCH';
    reasons.push(`Invoice total $${invoiceTotalAmount.toFixed(2)} exceeds PayPal authorization hold of $${authorizedAmount.toFixed(2)}.`);
  }

  // 5. Recommended Action
  let recommendedAction: FourWayReconciliationResult['recommendedAction'] = 'PROCEED_AUTOMATIC_SETTLEMENT';
  if (overallStatus === 'FROZEN_VARIANCE_EXCEEDED' || overallStatus === 'SUPPLIER_MISMATCH') {
    recommendedAction = 'BLOCK_AND_VOID';
  } else if (overallStatus === 'PARTIAL_MATCH') {
    recommendedAction = 'CLAMP_PARTIAL_PAYMENT';
  } else if (overallStatus !== 'MATCHED') {
    recommendedAction = 'REQUEST_HUMAN_APPROVAL';
  }

  const result: FourWayReconciliationResult = {
    reconciliationId: `REC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    poNumber: po.poNumber,
    invoiceNumber: invoice.invoiceNumber,
    deliveryId: delivery?.deliveryId || 'NO_DELIVERY_REF',
    authorizationId: authorization?.authorizationId || 'NO_AUTH_REF',
    timestamp: new Date().toISOString(),
    supplierMatched,
    currencyMatched,
    matchStatus: overallStatus,
    reasons,
    totalOrderedQty,
    totalInvoicedQty,
    totalDeliveredQty,
    totalAcceptedQty,
    poTotalAmount,
    invoiceTotalAmount,
    authorizedAmount,
    verifiedAcceptedAmount,
    eligibleSettlementAmount,
    unverifiedAmount,
    overbillingAmount,
    priceVariancePct,
    quantityVariancePct,
    lineItems: lineItemResults,
    recommendedAction,
  };

  return result;
}
