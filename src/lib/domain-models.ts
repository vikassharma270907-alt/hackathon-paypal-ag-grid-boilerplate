/**
 * VeriSettle AI — Relational Domain Models & Entities
 * Grounded in the architectural principle:
 * "AI/ML PROPOSES → EVIDENCE ENGINE VERIFIES → DETERMINISTIC POLICY DECIDES → HUMAN AUTHORIZES WHEN REQUIRED → PAYPAL EXECUTES → AUDIT LEDGER RECORDS."
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

export interface ExtractionEvidence {
  evidenceId: string;
  sourceDocumentId: string;
  sourceDocumentHash: string; // SHA-256
  fileName: string;
  pageNumber: number;
  boundingBox?: BoundingBox;
  extractedValue: string | number;
  normalizedValue: string | number;
  fieldName: string;
  extractionMethod: 'LAYOUTLMV3' | 'GEMINI_STRUCTURED' | 'REGEX_OCR' | 'CHANNEL3_CATALOG' | 'CARRIER_TELEMETRY';
  modelUsed: string;
  confidence?: number;
  verificationResult: 'VERIFIED' | 'DISCREPANCY_FLAGGED' | 'UNVERIFIED' | 'SYNTHETIC';
  timestamp: string;
}

export interface PurchaseOrderItem {
  itemId: string;
  sku: string;
  description: string;
  category: string;
  orderedQuantity: number;
  agreedUnitPrice: number;
  totalPrice: number;
  channel3MarketBenchmarkPrice?: number;
}

export interface PurchaseOrder {
  poId: string;
  poNumber: string;
  buyerOrganization: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  issuedAt: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  items: PurchaseOrderItem[];
}

export interface InvoiceItem {
  itemId: string;
  sku: string;
  description: string;
  invoicedQuantity: number;
  unitPrice: number;
  lineTotal: number;
  taxAmount?: number;
  evidenceId?: string;
}

export interface SupplierInvoice {
  invoiceId: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  poNumberReference: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  invoiceTotal: number;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: string;
  status: 'RECEIVED' | 'EXTRACTED' | 'RECONCILED' | 'FROZEN' | 'SETTLED';
  sourceDocumentHash: string;
  items: InvoiceItem[];
}

export interface DeliveryItem {
  itemId: string;
  sku: string;
  description: string;
  orderedQuantity: number;
  deliveredQuantity: number;
  acceptedQuantity: number;
  damagedQuantity: number;
  conditionNotes?: string;
}

export interface DeliveryEvidence {
  deliveryId: string;
  poNumber: string;
  invoiceNumber: string;
  carrier: string;
  trackingNumber: string;
  shipDate: string;
  deliveredDate: string;
  carrierSignedBy: string;
  verificationStatus: 'DELIVERED_FULL' | 'DELIVERED_PARTIAL' | 'DAMAGED_IN_TRANSIT' | 'UNVERIFIED';
  slipDocumentHash?: string;
  items: DeliveryItem[];
}

export interface PayPalAuthorizationRecord {
  authorizationId: string;
  orderId: string;
  intent: 'AUTHORIZE';
  authorizedAmount: number;
  capturedAmount: number;
  voidedAmount: number;
  currency: string;
  status: 'CREATED' | 'AUTHORIZED' | 'PARTIALLY_CAPTURED' | 'CAPTURED' | 'VOIDED';
  createdAt: string;
  expiresAt: string;
  paypalDebugId?: string;
}

export interface PaymentMandate {
  mandateId: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  maxOrderAmount: number;
  maxWeeklyBudget: number;
  currentWeeklySpend: number;
  allowedCategories: string[];
  maxInvoiceVariancePct: number;
  requireDeliveryVerification: boolean;
  humanApprovalRequiredAbove: number;
  maxRiskScore: number;
  expiresAt: string;
  createdAt: string;
  publicKey: string;
  signature?: string;
  mandateDigest: string; // SHA-256 canonical JSON
}

export interface MandateApproval {
  approvalId: string;
  mandateId: string;
  transactionId: string;
  approverIdentity: string;
  authorizedAmount: number;
  transactionDigest: string;
  nonce: string;
  approvedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'INVALIDATED';
  comments?: string;
}

export interface ModelRiskComponent {
  modelName: string;
  score: number; // 0.0 to 1.0
  confidence?: number;
  interpretation: string;
  featuresUsed?: string[];
  topShapValues?: Array<{ feature: string; impact: number }>;
}

export interface RiskAssessment {
  assessmentId: string;
  transactionId: string;
  timestamp: string;
  comprehensiveRiskScore: number;
  plattCalibratedScore: number;
  geminiInterpretation: string;
  xgboostScore: number;
  isolationForestScore: number;
  lstmAutoencoderScore: number;
  disagreementDetected: boolean;
  disagreementSummary?: string;
  modelBreakdown: ModelRiskComponent[];
  topRiskFactors: string[];
  systemRecommendation: 'APPROVE' | 'REQUIRE_HUMAN_APPROVAL' | 'BLOCK';
}

export type FourWayMatchStatus =
  | 'MATCHED'
  | 'PARTIAL_MATCH'
  | 'PRICE_VARIANCE'
  | 'QUANTITY_VARIANCE'
  | 'DELIVERY_UNVERIFIED'
  | 'SUPPLIER_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'AUTHORIZATION_MISMATCH'
  | 'FROZEN_VARIANCE_EXCEEDED'
  | 'MANUAL_REVIEW_REQUIRED';

export interface LineItemReconciliation {
  sku: string;
  description: string;
  orderedQty: number;
  invoicedQty: number;
  deliveredQty: number;
  acceptedQty: number;
  damagedQty: number;
  agreedUnitPrice: number;
  invoicedUnitPrice: number;
  eligibleQuantity: number;
  eligibleLineAmount: number;
  priceVariancePct: number;
  quantityVariancePct: number;
  status: FourWayMatchStatus;
  notes: string;
  evidenceRef?: ExtractionEvidence;
}

export interface FourWayReconciliationResult {
  reconciliationId: string;
  poNumber: string;
  invoiceNumber: string;
  deliveryId: string;
  authorizationId: string;
  timestamp: string;
  supplierMatched: boolean;
  currencyMatched: boolean;
  matchStatus: FourWayMatchStatus;
  reasons: string[];
  // Quantities
  totalOrderedQty: number;
  totalInvoicedQty: number;
  totalDeliveredQty: number;
  totalAcceptedQty: number;
  // Financial amounts (deterministic Decimal-safe)
  poTotalAmount: number;
  invoiceTotalAmount: number;
  authorizedAmount: number;
  verifiedAcceptedAmount: number;
  eligibleSettlementAmount: number;
  unverifiedAmount: number;
  overbillingAmount: number;
  priceVariancePct: number;
  quantityVariancePct: number;
  lineItems: LineItemReconciliation[];
  recommendedAction: 'PROCEED_AUTOMATIC_SETTLEMENT' | 'REQUEST_HUMAN_APPROVAL' | 'CLAMP_PARTIAL_PAYMENT' | 'BLOCK_AND_VOID';
}

export interface DisputeEconomicCalculation {
  disputedAmount: number;
  costOfAcceptingClaim: number;
  costOfFightingClaim: number;
  evidencePreparationCost: number;
  disputeFee: number;
  estimatedWinProbability: number;
  expectedValueFighting: number;
  expectedValueAccepting: number;
  recommendedAction: 'PROVIDE_EVIDENCE' | 'MAKE_OFFER' | 'ACCEPT_CLAIM' | 'REQUEST_MORE_INFORMATION';
  rationale: string;
}

export interface EvidencePackDocument {
  title: string;
  documentType: 'PURCHASE_ORDER' | 'SUPPLIER_INVOICE' | 'DELIVERY_RECEIPT' | 'CARRIER_TRACKING' | 'PAYPAL_RECEIPT' | 'ANALYSIS_REPORT';
  sourceHash: string;
  verifiedTimestamp: string;
  keyFacts: string[];
}

export interface DisputeEvidencePack {
  packId: string;
  disputeId: string;
  paypalCaseId: string;
  generatedAt: string;
  summary: string;
  timeline: Array<{ event: string; timestamp: string; citation: string }>;
  documents: EvidencePackDocument[];
  quantityReconciliation: { ordered: number; invoiced: number; delivered: number; accepted: number };
  financialCalculation: { claimedAmount: number; verifiedEligible: number; proposedAdjustment: number };
  aiAnalysisExplanation: string;
  missingOrInconclusiveEvidence: string[];
  humanAuthorizedBy?: string;
  humanAuthorizedAt?: string;
}

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  payloadDigest: string; // SHA-256
  details: Record<string, unknown>;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
}
