import { describe, it, expect, beforeEach } from 'vitest';
import { DecimalMath, runFourWayReconciliation } from '../src/lib/reconciliation-engine';
import {
  createSignedPaymentMandate,
  evaluateMandatePolicyFirewall,
  generateNonce,
  consumeNonce,
  signPayloadEd25519,
  verifySignatureEd25519,
  computeSha256Digest,
  getServerSigningKeys,
} from '../src/lib/mandate-crypto';
import { buildTransactionEvidenceGraph } from '../src/lib/evidence-graph';
import { evaluateAdvancedMLRisk } from '../src/lib/ml-intelligence';
import { evaluateDisputeEconomics, generateDisputeEvidencePack } from '../src/lib/dispute-copilot';
import { transactionStateMachine } from '../src/lib/paypal-state-machine';
import { executeJudgeDemoScenario, resetDemoState } from '../src/lib/demo-engine';
import { evidenceStore } from '../src/lib/evidence-store';
import { PurchaseOrder, SupplierInvoice, DeliveryEvidence, PayPalAuthorizationRecord } from '../src/lib/domain-models';

describe('VeriSettle AI — Competition Upgrade Verification Suite', () => {
  beforeEach(() => {
    resetDemoState();
  });

  // ==========================================
  // SECTION 1: FOUR-WAY RECONCILIATION ENGINE
  // ==========================================
  describe('1. Four-Way Reconciliation Engine', () => {
    it('1.1 decimal_safe_math: verifies floating-point accuracy and precision', () => {
      const sum = DecimalMath.add(0.1, 0.2);
      expect(sum).toBe(0.3); // Avoids IEEE 754 0.30000000000000004
      const mult = DecimalMath.multiply(245.0, 10);
      expect(mult).toBe(2450.0);
    });

    it('1.2 perfect_four_way_match: verifies 100% matched PO, Invoice, Delivery, and Auth', () => {
      const po = evidenceStore.purchaseOrders.get('PO-2026-001')!;
      const invoice = evidenceStore.invoices.get('INV-2026-001')!;
      const delivery = evidenceStore.deliveries.get('DEL-2026-001')!;
      const auth = evidenceStore.authorizations.get('AUTH-2026-001')!;

      const result = runFourWayReconciliation({ po, invoice, delivery, authorization: auth });
      expect(result.matchStatus).toBe('MATCHED');
      expect(result.priceVariancePct).toBe(0.0);
      expect(result.eligibleSettlementAmount).toBe(2450.0);
      expect(result.unverifiedAmount).toBe(0.0);
      expect(result.recommendedAction).toBe('PROCEED_AUTOMATIC_SETTLEMENT');
    });

    it('1.3 price_variance_freeze: flags variance > 1.5% and fails closed', () => {
      const po = evidenceStore.purchaseOrders.get('PO-2026-001')!;
      const invoice: SupplierInvoice = {
        ...evidenceStore.invoices.get('INV-2026-001')!,
        invoiceTotal: 2572.5, // Exactly +5.0% variance
        items: [{
          itemId: 'INVI-1',
          sku: 'APEX-SW-10G',
          description: 'Enterprise Edge Switch 10G',
          invoicedQuantity: 10,
          unitPrice: 257.25,
          lineTotal: 2572.5,
        }],
      };
      const delivery = evidenceStore.deliveries.get('DEL-2026-001')!;
      const auth = evidenceStore.authorizations.get('AUTH-2026-001')!;

      const result = runFourWayReconciliation({ po, invoice, delivery, authorization: auth, maxVariancePct: 1.5 });
      expect(result.matchStatus).toBe('FROZEN_VARIANCE_EXCEEDED');
      expect(result.priceVariancePct).toBe(5.0);
      expect(result.recommendedAction).toBe('BLOCK_AND_VOID');
    });

    it('1.4 partial_delivery_clamping: clamps eligible settlement to verified dock receipt', () => {
      const po = evidenceStore.purchaseOrders.get('PO-2026-001')!;
      const invoice = evidenceStore.invoices.get('INV-2026-001')!;
      const delivery: DeliveryEvidence = {
        ...evidenceStore.deliveries.get('DEL-2026-001')!,
        verificationStatus: 'DELIVERED_PARTIAL',
        items: [{
          itemId: 'DELI-1',
          sku: 'APEX-SW-10G',
          description: 'Enterprise Edge Switch 10G',
          orderedQuantity: 10,
          deliveredQuantity: 7,
          acceptedQuantity: 7, // Only 70% accepted
          damagedQuantity: 0,
        }],
      };

      const result = runFourWayReconciliation({ po, invoice, delivery });
      expect(result.matchStatus).toBe('PARTIAL_MATCH');
      expect(result.totalAcceptedQty).toBe(7);
      expect(result.eligibleSettlementAmount).toBe(1715.0); // 7 * 245.0
      expect(result.unverifiedAmount).toBe(735.0); // 2450 - 1715
      expect(result.recommendedAction).toBe('CLAMP_PARTIAL_PAYMENT');
    });

    it('1.5 currency_and_supplier_mismatch: detects currency or supplier divergence', () => {
      const po = evidenceStore.purchaseOrders.get('PO-2026-001')!;
      const invoiceEuro: SupplierInvoice = {
        ...evidenceStore.invoices.get('INV-2026-001')!,
        currency: 'EUR',
      };
      const result = runFourWayReconciliation({ po, invoice: invoiceEuro });
      expect(result.currencyMatched).toBe(false);
      expect(result.matchStatus).toBe('CURRENCY_MISMATCH');
    });
  });

  // ==========================================
  // SECTION 2: CRYPTOGRAPHIC PAYMENT MANDATES
  // ==========================================
  describe('2. Cryptographic Payment Mandates & Policy Firewall', () => {
    it('2.1 ed25519_signing_and_verification: signs and verifies with asymmetric key pair', () => {
      const keys = getServerSigningKeys();
      const payload = { test: 'mandate', amount: 5000, supplier: 'SUP-001' };
      const { signature, digest } = signPayloadEd25519(payload, keys.privateKey);

      expect(signature).toBeDefined();
      expect(digest).toMatch(/^[a-f0-9]{64}$/);

      const isValid = verifySignatureEd25519(payload, signature, keys.publicKey);
      expect(isValid).toBe(true);

      // Tampered payload fails verification
      const isTamperedValid = verifySignatureEd25519({ ...payload, amount: 9999 }, signature, keys.publicKey);
      expect(isTamperedValid).toBe(false);
    });

    it('2.2 nonce_replay_protection: consumes single-use nonce and blocks replay attacks', () => {
      const nonce = generateNonce('TEST');
      const firstCheck = consumeNonce(nonce);
      expect(firstCheck.valid).toBe(true);

      // Replaying the exact same nonce fails immediately
      const secondCheck = consumeNonce(nonce);
      expect(secondCheck.valid).toBe(false);
      expect(secondCheck.reason).toContain('replay detected');
    });

    it('2.3 mandate_policy_firewall_blocks_expired_mandate', () => {
      const mandate = createSignedPaymentMandate({
        mandateId: 'VM-EXPIRED',
        supplierId: 'SUP-001',
        supplierName: 'Apex Cloud Hardware',
        currency: 'USD',
        maxOrderAmount: 5000,
        maxWeeklyBudget: 25000,
        allowedCategories: ['Cloud Hardware'],
        maxInvoiceVariancePct: 1.5,
        requireDeliveryVerification: true,
        humanApprovalRequiredAbove: 500,
        maxRiskScore: 0.70,
        expiresAt: '2020-01-01T00:00:00Z', // Expired
      });

      const res = evaluateMandatePolicyFirewall({
        mandate,
        supplierId: 'SUP-001',
        recipient: 'Apex Cloud Hardware',
        category: 'Cloud Hardware',
        currency: 'USD',
        proposedAmount: 1000,
        deliveryVerified: true,
        comprehensiveRiskScore: 0.1,
        invoiceVariancePct: 0.0,
        nonce: generateNonce(),
      });

      expect(res.decision).toBe('BLOCK');
      expect(res.status).toBe('BLOCKED_MANDATE_EXPIRED');
    });

    it('2.4 mandate_policy_firewall_enforces_order_cap_and_budget', () => {
      const mandate = evidenceStore.mandates.get('VM-001')!;

      // Exceeds maxSingleOrderUsd ($5,000)
      const res = evaluateMandatePolicyFirewall({
        mandate,
        supplierId: 'SUP-001',
        recipient: 'Apex Cloud Hardware Inc.',
        category: 'Cloud Hardware',
        currency: 'USD',
        proposedAmount: 6500.0, // > 5000
        deliveryVerified: true,
        comprehensiveRiskScore: 0.1,
        invoiceVariancePct: 0.0,
        nonce: generateNonce(),
      });

      expect(res.decision).toBe('BLOCK');
      expect(res.status).toBe('BLOCKED_ORDER_CAP_EXCEEDED');
    });
  });

  // ==========================================
  // SECTION 3: TRANSACTION EVIDENCE GRAPH
  // ==========================================
  describe('3. Transaction Evidence Graph', () => {
    it('3.1 dag_construction: builds connected nodes and edges with provenance', () => {
      const po = evidenceStore.purchaseOrders.get('PO-2026-001')!;
      const invoice = evidenceStore.invoices.get('INV-2026-001')!;
      const delivery = evidenceStore.deliveries.get('DEL-2026-001')!;
      const auth = evidenceStore.authorizations.get('AUTH-2026-001')!;
      const mandate = evidenceStore.mandates.get('VM-001')!;

      const graph = buildTransactionEvidenceGraph({ po, invoice, delivery, authorization: auth, mandate });
      expect(graph.nodes.length).toBeGreaterThanOrEqual(8);
      expect(graph.edges.length).toBeGreaterThanOrEqual(6);

      const ocrNode = graph.nodes.find((n) => n.type === 'OCR_EXTRACTION');
      expect(ocrNode).toBeDefined();
      expect(ocrNode?.provenance?.boundingBox).toBeDefined();
      expect(ocrNode?.provenance?.pageNumber).toBe(1);
    });

    it('3.2 discrepancy_provenance: attaches detailed resolution on variance', () => {
      const po = evidenceStore.purchaseOrders.get('PO-2026-001')!;
      const tamperedInvoice: SupplierInvoice = {
        ...evidenceStore.invoices.get('INV-2026-001')!,
        invoiceTotal: 2572.5,
      };
      const recon = runFourWayReconciliation({ po, invoice: tamperedInvoice });

      const graph = buildTransactionEvidenceGraph({
        po,
        invoice: tamperedInvoice,
        reconciliation: recon,
      });

      const invNode = graph.nodes.find((n) => n.type === 'SUPPLIER_INVOICE');
      expect(invNode?.status).toBe('DISCREPANCY');
      expect(invNode?.discrepancyDetails).toBeDefined();
      expect(invNode?.discrepancyDetails?.extractedValue).toBe('$2572.50');
      expect(invNode?.discrepancyDetails?.whyDiscrepancyMatters).toContain('exceeds agreed purchase order');
    });
  });

  // ==========================================
  // SECTION 4: AI/ML RISK INTELLIGENCE & DISAGREEMENT
  // ==========================================
  describe('4. AI/ML Risk Intelligence & Model Disagreement', () => {
    it('4.1 model_disagreement_detection: catches divergence between Gemini and XGBoost', () => {
      const assessment = evaluateAdvancedMLRisk({
        transactionId: 'TX-DISAGREE-001',
        amount: 2450.0,
        unitPrice: 245.0,
        quantity: 10,
        category: 'Cloud Hardware',
        isNewSupplier: true, // Triggers XGBoost risk while document is clean
        carrierDelivered: true,
        channel3MeanPrice: 242.0,
        channel3StdPrice: 12.0,
        historicalSupplierOrderCount: 1,
        historicalDisputeRate: 0.0,
        reconciliationDiscrepancy: false, // Gemini reads clean document
      });

      expect(assessment.disagreementDetected).toBe(true);
      expect(assessment.disagreementSummary).toContain('Model Disagreement');
      expect(assessment.systemRecommendation).toBe('REQUIRE_HUMAN_APPROVAL');
      expect(assessment.modelBreakdown.length).toBe(4);
    });

    it('4.2 shap_feature_attributions: returns explainable factors', () => {
      const assessment = evaluateAdvancedMLRisk({
        transactionId: 'TX-SHAP-001',
        amount: 4800.0,
        unitPrice: 320.0, // High deviance
        quantity: 15,
        category: 'Cloud Hardware',
        isNewSupplier: false,
        carrierDelivered: true,
        channel3MeanPrice: 242.0,
        channel3StdPrice: 12.0,
        historicalSupplierOrderCount: 20,
        historicalDisputeRate: 0.0,
        reconciliationDiscrepancy: false,
      });

      const shapValues = assessment.modelBreakdown[0].topShapValues || [];
      expect(shapValues.length).toBeGreaterThan(0);
      expect(shapValues[0].impact).toBeDefined();
    });
  });

  // ==========================================
  // SECTION 5: PAYPAL STATE MACHINE
  // ==========================================
  describe('5. PayPal Transaction State Machine', () => {
    it('5.1 legal_transitions: allows valid chronological state path', () => {
      const txId = 'TX-STATE-TEST';
      const step1 = transactionStateMachine.transition(txId, 'ORDER_PENDING', 'SYS', 'Order created');
      expect(step1.success).toBe(true);
      const step2 = transactionStateMachine.transition(txId, 'AUTHORIZATION_PENDING', 'SYS', 'Hold requested');
      expect(step2.success).toBe(true);
      const step3 = transactionStateMachine.transition(txId, 'AUTHORIZED', 'SYS', 'Hold placed');
      expect(step3.success).toBe(true);
    });

    it('5.2 illegal_transitions: blocks illegal leap transitions', () => {
      const txId = 'TX-ILLEGAL-TEST';
      // Attempting to jump directly from CREATED to CAPTURED
      const res = transactionStateMachine.transition(txId, 'CAPTURED', 'SYS', 'Illegal jump');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Illegal state transition');
    });
  });

  // ==========================================
  // SECTION 6: AI DISPUTE DEFENSE COPILOT
  // ==========================================
  describe('6. AI Dispute Defense Copilot & EV Math', () => {
    it('6.1 economic_decision_math: calculates expected value of defending vs conceding', () => {
      const delivery = evidenceStore.deliveries.get('DEL-2026-001')!;
      const invoice = evidenceStore.invoices.get('INV-2026-001')!;

      const calc = evaluateDisputeEconomics({
        disputeId: 'PP-D-TEST',
        paypalDisputeId: 'PP-D-99120',
        disputedAmount: 1850.0,
        buyerClaimReason: 'Package unreceived',
        delivery,
        invoice,
      });

      expect(calc.costOfAcceptingClaim).toBe(1850.0);
      expect(calc.estimatedWinProbability).toBe(0.92); // High confidence with signed POD
      expect(calc.expectedValueFighting).toBeGreaterThan(1500.0);
      expect(calc.recommendedAction).toBe('PROVIDE_EVIDENCE');
    });

    it('6.2 evidence_pack_generation: compiles structured dossier with timeline and citations', () => {
      const po = evidenceStore.purchaseOrders.get('PO-2026-001')!;
      const invoice = evidenceStore.invoices.get('INV-2026-001')!;
      const delivery = evidenceStore.deliveries.get('DEL-2026-001')!;
      const auth = evidenceStore.authorizations.get('AUTH-2026-001')!;

      const pack = generateDisputeEvidencePack({
        disputeId: 'PP-D-PACK',
        paypalDisputeId: 'PP-D-11002',
        disputedAmount: 1850.0,
        buyerClaimReason: 'Did not receive hardware',
        po,
        invoice,
        delivery,
        authorization: auth,
      });

      expect(pack.documents.length).toBeGreaterThanOrEqual(4);
      expect(pack.timeline.length).toBeGreaterThanOrEqual(4);
      expect(pack.aiAnalysisExplanation).toContain('carrier proof of delivery');
    });
  });

  // ==========================================
  // SECTION 7: JUDGE DEMO SCENARIOS
  // ==========================================
  describe('7. Judge Demo Mode Scenarios', () => {
    it('7.1 scenario_a_clean: executes clean transaction end-to-end', async () => {
      const result = await executeJudgeDemoScenario('CLEAN');
      expect(result.overallStatus).toBe('SETTLEMENT_EXECUTED');
      expect(result.reconciliationStatus).toBe('MATCHED');
      expect(result.policyDecision).toBe('ALLOW');
      expect(result.eligibleSettlementAmount).toBe(2450.0);
      expect(result.trace.length).toBeGreaterThanOrEqual(6);
    });

    it('7.2 scenario_b_tampered: blocks tampered invoice and prevents money movement', async () => {
      const result = await executeJudgeDemoScenario('TAMPERED');
      expect(result.overallStatus).toBe('PAYMENT_BLOCKED');
      expect(result.policyDecision).toBe('BLOCK');
      expect(result.eligibleSettlementAmount).toBe(0);
      expect(result.preventedOverpaymentAmount).toBe(122.5); // +5% overpayment blocked
    });

    it('7.3 scenario_c_partial: clamps settlement to verified 70% delivery', async () => {
      const result = await executeJudgeDemoScenario('PARTIAL');
      expect(result.overallStatus).toBe('PARTIAL_CAPTURE_EXECUTED');
      expect(result.policyDecision).toBe('ALLOW');
      expect(result.eligibleSettlementAmount).toBe(1715.0); // 70% of 2450
      expect(result.preventedOverpaymentAmount).toBe(735.0);
    });
  });
});
