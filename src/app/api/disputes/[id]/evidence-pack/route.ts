import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";
import { generateDisputeEvidencePack } from "@/lib/dispute-copilot";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));

    const po = evidenceStore.purchaseOrders.get("PO-2026-001");
    const invoice = evidenceStore.invoices.get("INV-2026-001");
    const delivery = evidenceStore.deliveries.get("DEL-2026-001");
    const authorization = evidenceStore.authorizations.get("AUTH-2026-001");

    const pack = generateDisputeEvidencePack({
      disputeId: id,
      paypalDisputeId: body.paypalDisputeId || `PP-D-${id}`,
      disputedAmount: Number(body.disputedAmount || 1850.0),
      buyerClaimReason: body.buyerClaimReason || "Item not received or defective delivery",
      po,
      invoice,
      delivery,
      authorization,
    });

    evidenceStore.recordAudit(
      "DISPUTE_COPILOT",
      "GENERATE_EVIDENCE_PACK",
      "DisputeEvidencePack",
      pack.packId,
      pack.packId,
      {
        disputeId: id,
        paypalCaseId: pack.paypalCaseId,
        documentsCount: pack.documents.length,
      }
    );

    return NextResponse.json(pack);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate dispute evidence pack" },
      { status: 500 }
    );
  }
}
