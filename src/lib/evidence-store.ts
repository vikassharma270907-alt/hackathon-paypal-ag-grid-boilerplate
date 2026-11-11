import {
  PurchaseOrder,
  SupplierInvoice,
  DeliveryEvidence,
  PayPalAuthorizationRecord,
  PaymentMandate,
  MandateApproval,
  FourWayReconciliationResult,
  RiskAssessment,
  DisputeEconomicCalculation,
  DisputeEvidencePack,
  AuditEvent,
  ExtractionEvidence,
} from './domain-models';

/**
 * VeriSettle AI — Relational In-Memory Evidence & Transaction Store
 * Provides relational persistence, indexed querying, and audit preservation.
 */

class EvidenceStore {
  public purchaseOrders: Map<string, PurchaseOrder> = new Map();
  public invoices: Map<string, SupplierInvoice> = new Map();
  public deliveries: Map<string, DeliveryEvidence> = new Map();
  public authorizations: Map<string, PayPalAuthorizationRecord> = new Map();
  public mandates: Map<string, PaymentMandate> = new Map();
  public approvals: Map<string, MandateApproval> = new Map();
  public reconciliations: Map<string, FourWayReconciliationResult> = new Map();
  public riskAssessments: Map<string, RiskAssessment> = new Map();
  public evidenceItems: Map<string, ExtractionEvidence> = new Map();
  public auditEvents: AuditEvent[] = [];
  public disputes: Map<string, {
    disputeId: string;
    paypalDisputeId: string;
    transactionId: string;
    disputedAmount: number;
    reason: string;
    status: string;
    economicCalc: DisputeEconomicCalculation;
    evidencePack?: DisputeEvidencePack;
  }> = new Map();

  constructor() {
    this.seedDefaultData();
  }

  public recordAudit(
    actor: string,
    action: string,
    entityType: string,
    entityId: string,
    payloadDigest: string,
    details: Record<string, unknown>,
    severity: AuditEvent['severity'] = 'INFO'
  ): AuditEvent {
    const event: AuditEvent = {
      eventId: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      actor,
      action,
      entityType,
      entityId,
      payloadDigest,
      details,
      severity,
    };
    this.auditEvents.unshift(event);
    return event;
  }

  public seedDefaultData() {
    this.purchaseOrders.clear();
    this.invoices.clear();
    this.deliveries.clear();
    this.authorizations.clear();
    this.mandates.clear();
    this.approvals.clear();
    this.reconciliations.clear();
    this.riskAssessments.clear();
    this.evidenceItems.clear();
    this.disputes.clear();
    this.auditEvents = [];

    // 1. Evidence items with provenance (page numbers & bounding boxes)
    const ev1: ExtractionEvidence = {
      evidenceId: 'EV-INV-001-TOTAL',
      sourceDocumentId: 'DOC-INV-2026-001',
      sourceDocumentHash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
      fileName: 'Apex_Invoice_INV2026_001.pdf',
      pageNumber: 1,
      boundingBox: { x: 420, y: 720, width: 140, height: 28, page: 1 },
      extractedValue: '$2,450.00',
      normalizedValue: 2450.0,
      fieldName: 'invoice_total',
      extractionMethod: 'LAYOUTLMV3',
      modelUsed: 'layoutlmv3-sroie-v2',
      confidence: 0.985,
      verificationResult: 'VERIFIED',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    };
    this.evidenceItems.set(ev1.evidenceId, ev1);

    const ev2: ExtractionEvidence = {
      evidenceId: 'EV-INV-001-LINE1',
      sourceDocumentId: 'DOC-INV-2026-001',
      sourceDocumentHash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
      fileName: 'Apex_Invoice_INV2026_001.pdf',
      pageNumber: 1,
      boundingBox: { x: 50, y: 340, width: 480, height: 22, page: 1 },
      extractedValue: '10x Enterprise Edge Switch @ $245.00',
      normalizedValue: 2450.0,
      fieldName: 'line_item_1',
      extractionMethod: 'GEMINI_STRUCTURED',
      modelUsed: 'gemini-3.1-flash-lite',
      confidence: 0.992,
      verificationResult: 'VERIFIED',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    };
    this.evidenceItems.set(ev2.evidenceId, ev2);

    // 2. Purchase Order PO-2026-001
    const po1: PurchaseOrder = {
      poId: 'PO-2026-001',
      poNumber: 'PO-2026-001',
      buyerOrganization: 'VeriSettle Global Operations Inc.',
      supplierId: 'SUP-001',
      supplierName: 'Apex Cloud Hardware Inc.',
      currency: 'USD',
      subtotal: 2450.0,
      taxAmount: 0.0,
      shippingAmount: 0.0,
      totalAmount: 2450.0,
      issuedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      status: 'APPROVED',
      items: [
        {
          itemId: 'POI-001',
          sku: 'APEX-SW-10G',
          description: 'Enterprise Edge Switch 10G Managed Rackmount',
          category: 'Cloud Hardware',
          orderedQuantity: 10,
          agreedUnitPrice: 245.0,
          totalPrice: 2450.0,
          channel3MarketBenchmarkPrice: 242.5,
        },
      ],
    };
    this.purchaseOrders.set(po1.poNumber, po1);

    // 3. Supplier Invoice INV-2026-001
    const inv1: SupplierInvoice = {
      invoiceId: 'INV-2026-001',
      invoiceNumber: 'INV-2026-001',
      supplierId: 'SUP-001',
      supplierName: 'Apex Cloud Hardware Inc.',
      poNumberReference: 'PO-2026-001',
      currency: 'USD',
      subtotal: 2450.0,
      taxAmount: 0.0,
      shippingAmount: 0.0,
      invoiceTotal: 2450.0,
      invoiceDate: new Date(Date.now() - 86400000 * 2).toISOString(),
      dueDate: new Date(Date.now() + 86400000 * 28).toISOString(),
      paymentTerms: 'Net 30',
      status: 'RECONCILED',
      sourceDocumentHash: ev1.sourceDocumentHash,
      items: [
        {
          itemId: 'INVI-001',
          sku: 'APEX-SW-10G',
          description: 'Enterprise Edge Switch 10G Managed Rackmount',
          invoicedQuantity: 10,
          unitPrice: 245.0,
          lineTotal: 2450.0,
          evidenceId: ev2.evidenceId,
        },
      ],
    };
    this.invoices.set(inv1.invoiceNumber, inv1);

    // 4. Delivery Evidence DEL-2026-001
    const del1: DeliveryEvidence = {
      deliveryId: 'DEL-2026-001',
      poNumber: 'PO-2026-001',
      invoiceNumber: 'INV-2026-001',
      carrier: 'FedEx Freight B2B',
      trackingNumber: '782910482910',
      shipDate: new Date(Date.now() - 86400000 * 2).toISOString(),
      deliveredDate: new Date(Date.now() - 86400000 * 1).toISOString(),
      carrierSignedBy: 'M. REYNOLDS (DOCK 4)',
      verificationStatus: 'DELIVERED_FULL',
      items: [
        {
          itemId: 'DELI-001',
          sku: 'APEX-SW-10G',
          description: 'Enterprise Edge Switch 10G Managed Rackmount',
          orderedQuantity: 10,
          deliveredQuantity: 10,
          acceptedQuantity: 10,
          damagedQuantity: 0,
          conditionNotes: 'All 10 tamper seals intact. Passed hardware QA test.',
        },
      ],
    };
    this.deliveries.set(del1.deliveryId, del1);

    // 5. PayPal Authorization AUTH-2026-001
    const auth1: PayPalAuthorizationRecord = {
      authorizationId: 'AUTH-2026-001',
      orderId: 'ORD-2026-001',
      intent: 'AUTHORIZE',
      authorizedAmount: 2450.0,
      capturedAmount: 0.0,
      voidedAmount: 0.0,
      currency: 'USD',
      status: 'AUTHORIZED',
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 26).toISOString(),
      paypalDebugId: 'PAYPAL-DBG-991204',
    };
    this.authorizations.set(auth1.authorizationId, auth1);

    // 6. Payment Mandate VM-001
    const mandate1: PaymentMandate = {
      mandateId: 'VM-001',
      supplierId: 'SUP-001',
      supplierName: 'Apex Cloud Hardware Inc.',
      currency: 'USD',
      maxOrderAmount: 5000.0,
      maxWeeklyBudget: 25000.0,
      currentWeeklySpend: 2450.0,
      allowedCategories: ['Office Equipment', 'Cloud Hardware', 'Cafe & Packaging Supplies'],
      maxInvoiceVariancePct: 1.5,
      requireDeliveryVerification: true,
      humanApprovalRequiredAbove: 500.0,
      maxRiskScore: 0.7,
      expiresAt: '2027-11-13T00:00:00Z',
      createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      publicKey: 'ed25519_pk_verisettle_enterprise_root_001',
      signature: 'sig_ed25519_demo_valid_99a8b7',
      mandateDigest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    this.mandates.set(mandate1.mandateId, mandate1);

    // 7. Seed Initial Audit Record
    this.recordAudit(
      'SYSTEM_INITIALIZER',
      'STORE_BOOTSTRAP',
      'System',
      'ROOT',
      '0000000000000000000000000000000000000000000000000000000000000000',
      { status: 'INITIALIZED', recordsCount: 1, environment: 'SANDBOX' }
    );
  }
}

// Global Singleton
const globalStoreKey = Symbol.for('verisettle.evidence.store');
const globalAny = globalThis as unknown as { [key: symbol]: EvidenceStore };

export const evidenceStore = globalAny[globalStoreKey] || (globalAny[globalStoreKey] = new EvidenceStore());
