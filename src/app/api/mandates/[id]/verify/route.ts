import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";
import { verifySignatureEd25519 } from "@/lib/mandate-crypto";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const mandate = evidenceStore.mandates.get(id);

    if (!mandate) {
      return NextResponse.json({ error: `Mandate '${id}' not found.` }, { status: 404 });
    }

    if (!mandate.signature || !mandate.publicKey) {
      return NextResponse.json({
        mandateId: id,
        verified: false,
        reason: "Mandate is missing cryptographic signature or public key.",
      });
    }

    const rawPayload = {
      mandateId: mandate.mandateId,
      supplierId: mandate.supplierId,
      currency: mandate.currency,
      maxOrderAmount: mandate.maxOrderAmount,
      maxWeeklyBudget: mandate.maxWeeklyBudget,
      allowedCategories: mandate.allowedCategories,
      maxInvoiceVariancePct: mandate.maxInvoiceVariancePct,
      requireDeliveryVerification: mandate.requireDeliveryVerification,
      humanApprovalRequiredAbove: mandate.humanApprovalRequiredAbove,
      maxRiskScore: mandate.maxRiskScore,
      expiresAt: mandate.expiresAt,
    };

    const isValid = verifySignatureEd25519(rawPayload, mandate.signature, mandate.publicKey);

    return NextResponse.json({
      mandateId: id,
      verified: isValid,
      digest: mandate.mandateDigest,
      algorithm: "Ed25519",
      checkedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify mandate signature" },
      { status: 500 }
    );
  }
}
