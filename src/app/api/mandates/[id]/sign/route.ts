import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";
import { signPayloadEd25519, getServerSigningKeys } from "@/lib/mandate-crypto";

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

    const keys = getServerSigningKeys();
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

    const { signature, digest } = signPayloadEd25519(rawPayload, keys.privateKey);

    mandate.signature = signature;
    mandate.mandateDigest = digest;
    mandate.publicKey = keys.publicKey;
    evidenceStore.mandates.set(id, mandate);

    evidenceStore.recordAudit(
      "MANDATE_SECURITY",
      "SIGN_MANDATE",
      "PaymentMandate",
      mandate.mandateId,
      digest,
      { algorithm: "Ed25519", signatureLength: signature.length }
    );

    return NextResponse.json({
      mandateId: mandate.mandateId,
      signature,
      digest,
      algorithm: "Ed25519",
      publicKey: keys.publicKey,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sign mandate" },
      { status: 500 }
    );
  }
}
