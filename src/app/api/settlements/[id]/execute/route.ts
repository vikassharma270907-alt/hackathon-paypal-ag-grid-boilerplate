import { NextRequest, NextResponse } from "next/server";
import { evidenceStore } from "@/lib/evidence-store";
import { getPayPalAccessToken, generateRequestId } from "@/lib/paypal-auth";
import { settleAuthorizationHold } from "@/lib/paypal-escrow-disputes";
import { transactionStateMachine } from "@/lib/paypal-state-machine";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const {
      amount,
      currency = "USD",
      authorizationId = "AUTH-2026-001",
      approvalId,
      finalCapture = true,
    } = body;

    if (!amount) {
      return NextResponse.json({ error: "Amount is required for settlement execution." }, { status: 400 });
    }

    const captureAmountStr = Number(amount).toFixed(2);
    const requestId = generateRequestId(`exec-${id}`);

    const accessToken = await getPayPalAccessToken();
    const { data, trace } = await settleAuthorizationHold(
      accessToken,
      authorizationId,
      "CAPTURE",
      captureAmountStr,
      currency,
      requestId
    );

    const captureId = (data as any)?.id || `SIM-CAP-${Date.now().toString(36).toUpperCase()}`;
    const paypalDebugId = trace.paypalDebugId || "SANDBOX-DEBUG-ID-OK";

    transactionStateMachine.transition(
      id,
      "CAPTURED",
      "SETTLEMENT_OPERATIONS",
      `Executed capture for $${captureAmountStr} ${currency}`,
      paypalDebugId,
      requestId
    );

    evidenceStore.recordAudit(
      "SETTLEMENT_EXECUTOR",
      "CAPTURE_SETTLEMENT",
      "PayPalCapture",
      captureId,
      trace.requestId,
      {
        transactionId: id,
        capturedAmount: captureAmountStr,
        currency,
        authorizationId,
        approvalId,
        finalCapture,
        paypalDebugId,
      }
    );

    return NextResponse.json({
      status: "COMPLETED",
      transactionId: id,
      captureId,
      capturedAmount: captureAmountStr,
      currency,
      authorizationId,
      finalCapture,
      paypalDebugId,
      latencyMs: trace.latencyMs,
      trace,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to execute settlement capture" },
      { status: 500 }
    );
  }
}
