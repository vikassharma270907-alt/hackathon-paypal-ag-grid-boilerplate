import { NextRequest, NextResponse } from "next/server";
import { getPayPalAccessToken } from "@/lib/paypal-auth";
import { executeDisputeResolution } from "@/lib/paypal-escrow-disputes";
import { evaluateDisputeTriage } from "@/lib/ml-fallback";
import { denyUnlessAuthorized, rejectOversizedBody } from "@/lib/api-guard";
import { isValidMoney } from "@/lib/validation";

const STRATEGIES = ["MAKE_OFFER", "ACCEPT_CLAIM", "PROVIDE_EVIDENCE"] as const;

export async function POST(req: NextRequest) {
  try {
    const denied = denyUnlessAuthorized(req);
    if (denied) return denied;
    const tooLarge = rejectOversizedBody(req, 16_384);
    if (tooLarge) return tooLarge;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
    }
    if (body.strategyOverride !== undefined && !STRATEGIES.includes(body.strategyOverride)) {
      return NextResponse.json({ error: `strategyOverride must be one of ${STRATEGIES.join(", ")}.` }, { status: 400 });
    }
    if (body.disputedAmount !== undefined && !isValidMoney(body.disputedAmount)) {
      return NextResponse.json({ error: "disputedAmount must be a positive amount with at most 2 decimals." }, { status: 400 });
    }
    if (body.offerAmount !== undefined) {
      const disputed = Number(body.disputedAmount ?? 1850);
      if (!isValidMoney(body.offerAmount) || Number(body.offerAmount) > disputed) {
        return NextResponse.json({ error: "offerAmount must be positive and no greater than the disputed amount." }, { status: 400 });
      }
    }
    for (const field of ["baseWinProb"] as const) {
      const v = body[field];
      if (v !== undefined && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 1)) {
        return NextResponse.json({ error: `${field} must be between 0 and 1.` }, { status: 400 });
      }
    }
    if (body.llmWinProbAdjustment !== undefined && !Number.isFinite(Number(body.llmWinProbAdjustment))) {
      return NextResponse.json({ error: "llmWinProbAdjustment must be a number." }, { status: 400 });
    }
    const {
      action = "TRIAGE_AND_EXECUTE",
      disputeId = "PP-D-94821",
      orderId = "ORD-2026-X88",
      trackingNumber = "1Z9999999999999999",
      invoiceId = "INV-2026-001",
      disputedAmount = 1850.0,
      baseWinProb = 0.82,
      llmWinProbAdjustment = 0.05,
      strategyOverride,
      offerAmount,
    } = body;

    // 1. Calculate Expected Cost Triage with strict ±0.15 LLM clamp
    const triageResult = evaluateDisputeTriage({
      disputeId,
      orderId,
      trackingNumber,
      invoiceId,
      disputedAmountUsd: parseFloat(String(disputedAmount)),
      baseWinProb: parseFloat(String(baseWinProb)),
      llmWinProbAdjustment: parseFloat(String(llmWinProbAdjustment)),
      partialOfferAmountUsd: offerAmount ? parseFloat(String(offerAmount)) : undefined,
    });

    if (action === "TRIAGE_ONLY") {
      return NextResponse.json({
        action: "TRIAGE_ONLY",
        triage: triageResult,
      });
    }

    // Executing a dispute action (offer / accept / evidence) is a money decision: it needs a human
    // operator (operator key in production). TRIAGE_ONLY stays available as a read-only recommendation.
    const strictDenied = denyUnlessAuthorized(req, { strict: true });
    if (strictDenied) return strictDenied;

    // 2. Execute optimal or overridden strategy against PayPal Customer Disputes v1
    const chosenStrategy = (strategyOverride || triageResult.recommendedStrategy) as
      | "MAKE_OFFER"
      | "ACCEPT_CLAIM"
      | "PROVIDE_EVIDENCE";

    const accessToken = await getPayPalAccessToken();

    let payload: Record<string, unknown> = {};
    if (chosenStrategy === "MAKE_OFFER") {
      payload = {
        offer_type: "REFUND",
        offer_amount: {
          currency_code: "USD",
          value: offerAmount ? String(offerAmount) : (disputedAmount * 0.5).toFixed(2),
        },
        note: `Autonomous Settlement Offer based on EV Minimization ($${triageResult.costMakeOfferUsd} expected loss).`,
      };
    } else if (chosenStrategy === "PROVIDE_EVIDENCE") {
      payload = {
        evidence_type: "PROOF_OF_DELIVERY",
        evidence_info: {
          tracking_info: [{ carrier_name: "FEDEX", tracking_number: trackingNumber }],
        },
        notes: triageResult.rebuttalDraftWithCitations,
      };
    } else if (chosenStrategy === "ACCEPT_CLAIM") {
      payload = {
        note: "Claim accepted after automated triage determined defense cost exceeds dispute value.",
      };
    }

    const { data, trace } = await executeDisputeResolution(accessToken, disputeId, chosenStrategy, payload);

    return NextResponse.json({
      action: "TRIAGE_AND_EXECUTE",
      triage: triageResult,
      executedStrategy: chosenStrategy,
      disputeResponse: data,
      trace,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

