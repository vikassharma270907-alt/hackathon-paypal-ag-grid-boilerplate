import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";
import { buildTransactionEvidenceGraph } from "@/lib/evidence-graph";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const poNumber = searchParams.get("poNumber") || "PO-2026-001";
    const invoiceNumber = searchParams.get("invoiceNumber") || "INV-2026-001";

    const po = evidenceStore.purchaseOrders.get(poNumber);
    const invoice = evidenceStore.invoices.get(invoiceNumber);
    const delivery = evidenceStore.deliveries.get("DEL-2026-001");
    const authorization = evidenceStore.authorizations.get("AUTH-2026-001");
    const mandate = evidenceStore.mandates.get("VM-001");

    const graph = buildTransactionEvidenceGraph({
      po,
      invoice,
      delivery,
      authorization,
      mandate,
      auditEvents: evidenceStore.auditEvents,
      channel3Bench: {
        query: "Enterprise Edge Switch",
        normPrice: 242.5,
        zScore: 0.21,
      },
    });

    return NextResponse.json(graph);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build evidence graph" },
      { status: 500 }
    );
  }
}
