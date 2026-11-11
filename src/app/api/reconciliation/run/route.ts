import { NextRequest, NextResponse } from "next/server";
import { runFourWayReconciliation } from "@/lib/reconciliation-engine";
import { evidenceStore } from "@/lib/evidence-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { poNumber, invoiceNumber, deliveryId, authorizationId, maxVariancePct = 1.5 } = body;

    const po = evidenceStore.purchaseOrders.get(poNumber) || evidenceStore.purchaseOrders.get("PO-2026-001");
    const invoice = evidenceStore.invoices.get(invoiceNumber) || evidenceStore.invoices.get("INV-2026-001");
    const delivery = deliveryId ? evidenceStore.deliveries.get(deliveryId) : evidenceStore.deliveries.get("DEL-2026-001");
    const authorization = authorizationId ? evidenceStore.authorizations.get(authorizationId) : evidenceStore.authorizations.get("AUTH-2026-001");

    if (!po || !invoice) {
      return NextResponse.json(
        { error: "Purchase Order or Supplier Invoice not found in records." },
        { status: 404 }
      );
    }

    const result = runFourWayReconciliation({
      po,
      invoice,
      delivery,
      authorization,
      maxVariancePct,
    });

    evidenceStore.reconciliations.set(result.reconciliationId, result);
    evidenceStore.recordAudit(
      "RECONCILIATION_ENGINE",
      "RUN_FOUR_WAY_MATCH",
      "ReconciliationResult",
      result.reconciliationId,
      result.reconciliationId,
      {
        matchStatus: result.matchStatus,
        eligibleSettlementAmount: result.eligibleSettlementAmount,
        priceVariancePct: result.priceVariancePct,
      }
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reconciliation failed" },
      { status: 500 }
    );
  }
}
