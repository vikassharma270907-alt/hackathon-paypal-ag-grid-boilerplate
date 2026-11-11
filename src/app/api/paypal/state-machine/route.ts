import { NextRequest, NextResponse } from "next/server";
import { transactionStateMachine, PayPalTransactionState } from "@/lib/paypal-state-machine";

export async function GET(req: NextRequest) {
  const transactionId = req.nextUrl.searchParams.get("transactionId") || "PO-2026-001";
  const state = transactionStateMachine.getCurrentState(transactionId);
  const history = transactionStateMachine.getTransitionHistory(transactionId);
  return NextResponse.json({ transactionId, state, history });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      transactionId = "PO-2026-001",
      targetState,
      actor = "COMPLIANCE_OPERATOR",
      reason = "Manual state update",
      paypalDebugId,
      idempotencyKey,
    } = body;

    if (!targetState) {
      return NextResponse.json({ error: "targetState is required" }, { status: 400 });
    }

    const res = transactionStateMachine.transition(
      transactionId,
      targetState as PayPalTransactionState,
      actor,
      reason,
      paypalDebugId,
      idempotencyKey
    );

    if (!res.success) {
      return NextResponse.json(res, { status: 422 });
    }

    return NextResponse.json(res);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "State machine error" },
      { status: 500 }
    );
  }
}
