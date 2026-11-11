import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";
import { generateNonce } from "@/lib/mandate-crypto";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const {
      mandateId = "VM-001",
      approverIdentity = "operations.director@verisettle.internal",
      authorizedAmount,
      transactionDigest,
      action = "APPROVE", // 'APPROVE' or 'REJECT'
      comments,
    } = body;

    if (!transactionDigest || authorizedAmount === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: transactionDigest and authorizedAmount are required." },
        { status: 400 }
      );
    }

    const approvalId = `APP-${id}-${Date.now().toString(36).slice(2, 6).toUpperCase()}`;
    const approval = {
      approvalId,
      mandateId,
      transactionId: id,
      approverIdentity,
      authorizedAmount: Number(authorizedAmount),
      transactionDigest,
      nonce: generateNonce("APPR"),
      approvedAt: new Date().toISOString(),
      status: action === "APPROVE" ? ("APPROVED" as const) : ("REJECTED" as const),
      comments,
    };

    evidenceStore.approvals.set(approvalId, approval);
    evidenceStore.recordAudit(
      approverIdentity,
      action === "APPROVE" ? "GRANT_HUMAN_APPROVAL" : "REJECT_HUMAN_APPROVAL",
      "MandateApproval",
      approvalId,
      transactionDigest,
      { authorizedAmount, mandateId, transactionId: id }
    );

    return NextResponse.json({
      approvalId,
      status: approval.status,
      approverIdentity,
      authorizedAmount: approval.authorizedAmount,
      transactionDigest: approval.transactionDigest,
      timestamp: approval.approvedAt,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record approval" },
      { status: 500 }
    );
  }
}
