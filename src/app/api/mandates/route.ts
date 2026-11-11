import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";
import { createSignedPaymentMandate } from "@/lib/mandate-crypto";

export async function GET() {
  const mandates = Array.from(evidenceStore.mandates.values());
  return NextResponse.json({ count: mandates.length, mandates });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mandate = createSignedPaymentMandate({
      mandateId: body.mandateId || `VM-${Date.now().toString(36).slice(2, 6).toUpperCase()}`,
      supplierId: body.supplierId || "SUP-001",
      supplierName: body.supplierName || "Apex Cloud Hardware Inc.",
      currency: body.currency || "USD",
      maxOrderAmount: Number(body.maxOrderAmount || 5000),
      maxWeeklyBudget: Number(body.maxWeeklyBudget || 25000),
      allowedCategories: body.allowedCategories || ["Office Equipment", "Cloud Hardware", "Cafe & Packaging Supplies"],
      maxInvoiceVariancePct: Number(body.maxInvoiceVariancePct || 1.5),
      requireDeliveryVerification: body.requireDeliveryVerification !== false,
      humanApprovalRequiredAbove: Number(body.humanApprovalRequiredAbove || 500),
      maxRiskScore: Number(body.maxRiskScore || 0.70),
      expiresAt: body.expiresAt || new Date(Date.now() + 86400000 * 365).toISOString(),
    });

    return NextResponse.json(mandate, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create mandate" },
      { status: 500 }
    );
  }
}
