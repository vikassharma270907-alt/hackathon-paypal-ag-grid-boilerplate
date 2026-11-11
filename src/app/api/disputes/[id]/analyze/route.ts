import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";
import { evaluateDisputeEconomics, generateDisputeEvidencePack } from "@/lib/dispute-copilot";

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

    const analysis = evaluateDisputeEconomics({
      disputeId: id,
      paypalDisputeId: body.paypalDisputeId || `PP-D-${id}`,
      disputedAmount: Number(body.disputedAmount || 1850.0),
      buyerClaimReason: body.buyerClaimReason || "Item not received or defective delivery",
      po,
      invoice,
      delivery,
      authorization,
      evidencePrepCostUsd: Number(body.evidencePrepCostUsd || 25.0),
      disputeFeeUsd: Number(body.disputeFeeUsd || 15.0),
    });

    return NextResponse.json(analysis);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze dispute" },
      { status: 500 }
    );
  }
}
