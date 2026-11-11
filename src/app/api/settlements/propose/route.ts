import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";
import { runFourWayReconciliation } from "@/lib/reconciliation-engine";
import { evaluateMandatePolicyFirewall, generateNonce, computeSha256Digest } from "@/lib/mandate-crypto";
import { evaluateAdvancedMLRisk } from "@/lib/ml-intelligence";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { poNumber = "PO-2026-001", invoiceNumber = "INV-2026-001", mandateId = "VM-001" } = body;

    const po = evidenceStore.purchaseOrders.get(poNumber);
    const invoice = evidenceStore.invoices.get(invoiceNumber);
    const delivery = evidenceStore.deliveries.get("DEL-2026-001");
    const authorization = evidenceStore.authorizations.get("AUTH-2026-001");
    const mandate = evidenceStore.mandates.get(mandateId);

    if (!po || !invoice || !mandate) {
      return NextResponse.json({ error: "PO, Invoice, or Mandate not found in records." }, { status: 404 });
    }

    // 1. Reconcile 4-Way
    const recon = runFourWayReconciliation({ po, invoice, delivery, authorization });

    // 2. Score ML Risk
    const risk = evaluateAdvancedMLRisk({
      transactionId: po.poNumber,
      amount: invoice.invoiceTotal,
      unitPrice: invoice.items[0]?.unitPrice || 245.0,
      quantity: invoice.items[0]?.invoicedQuantity || 10,
      category: "Cloud Hardware",
      isNewSupplier: false,
      carrierDelivered: delivery?.verificationStatus !== "UNVERIFIED",
      channel3MeanPrice: 242.0,
      channel3StdPrice: 12.0,
      historicalSupplierOrderCount: 14,
      historicalDisputeRate: 0.0,
      reconciliationDiscrepancy: recon.matchStatus !== "MATCHED",
    });

    // 3. Evaluate Policy Firewall
    const nonce = generateNonce("PROP");
    const firewall = evaluateMandatePolicyFirewall({
      mandate,
      supplierId: invoice.supplierId,
      recipient: "Apex Cloud Hardware Inc.",
      category: "Cloud Hardware",
      currency: invoice.currency,
      proposedAmount: invoice.invoiceTotal,
      verifiedDeliveredAmount: recon.eligibleSettlementAmount,
      deliveryVerified: delivery?.verificationStatus === "DELIVERED_FULL",
      comprehensiveRiskScore: risk.comprehensiveRiskScore,
      invoiceVariancePct: recon.priceVariancePct,
      nonce,
    });

    const proposalId = `PROP-${Date.now().toString(36).toUpperCase()}`;
    const transactionDigest = computeSha256Digest({
      supplierId: invoice.supplierId,
      recipient: "apex cloud hardware inc.",
      category: "Cloud Hardware",
      currency: invoice.currency,
      proposedAmount: Number(invoice.invoiceTotal.toFixed(2)),
      deliveryVerified: delivery?.verificationStatus === "DELIVERED_FULL",
    });

    return NextResponse.json({
      proposalId,
      poNumber: po.poNumber,
      invoiceNumber: invoice.invoiceNumber,
      invoicedAmount: invoice.invoiceTotal,
      verifiedAcceptedAmount: recon.verifiedAcceptedAmount,
      eligibleSettlementAmount: recon.eligibleSettlementAmount,
      unverifiedAmount: recon.unverifiedAmount,
      firewallDecision: firewall.decision,
      firewallStatus: firewall.status,
      allowedAmount: firewall.allowedAmount,
      wasClamped: firewall.wasClamped,
      clampReason: firewall.clampReason,
      reconciliationStatus: recon.matchStatus,
      riskScore: risk.comprehensiveRiskScore,
      transactionDigest,
      mandateDigest: mandate.mandateDigest,
      reasons: firewall.reasons,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to propose settlement" },
      { status: 500 }
    );
  }
}
