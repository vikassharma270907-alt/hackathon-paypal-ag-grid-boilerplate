import { NextRequest, NextResponse } from "next/server";
import { getPayPalAccessToken, generateRequestId } from "@/lib/paypal-auth";
import {
  createEscrowAuthorizationOrder,
  settleAuthorizationHold,
  getOrderDetails,
  authorizeOrder,
  getAuthorizationDetails,
} from "@/lib/paypal-escrow-disputes";
import { evaluatePolicyFirewall } from "@/lib/policy-firewall";
import { denyUnlessAuthorized, rejectOversizedBody } from "@/lib/api-guard";
import { isValidMoney } from "@/lib/validation";

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
    // Money inputs are untrusted: they must be positive, finite, 2-decimal amounts.
    for (const field of ["amountValue", "verifiedCaptureAmount", "layoutlmInvoiceTotalUsd"] as const) {
      if (body[field] !== undefined && !isValidMoney(body[field])) {
        return NextResponse.json({ error: `${field} must be a positive amount with at most 2 decimals.` }, { status: 400 });
      }
    }
    if (body.comprehensiveRiskScore !== undefined) {
      const risk = Number(body.comprehensiveRiskScore);
      if (!Number.isFinite(risk) || risk < 0 || risk > 1) {
        return NextResponse.json({ error: "comprehensiveRiskScore must be between 0 and 1." }, { status: 400 });
      }
    }
    // The PayPal-Mock-Response test header must never be reachable on a production path.
    if (body.mockErrorHeader !== undefined && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "mockErrorHeader is not allowed in production." }, { status: 400 });
    }
    const {
      action,
      amountValue = "2450.00",
      currencyCode = "USD",
      customIntentId = `PO-ESCROW-${Date.now().toString(36).toUpperCase()}`,
      orderId,
      authorizationId,
      verifiedCaptureAmount,
      mockErrorHeader,
      category = "Office Equipment",
      layoutlmInvoiceTotalUsd,
      comprehensiveRiskScore,
      promptText,
    } = body;

    const accessToken = await getPayPalAccessToken();
    const requestId = generateRequestId("escrow");

    // Settling a hold moves money: it always needs a human operator (operator key in production),
    // never only the public sandbox-demo path.
    if (action === "CAPTURE" || action === "VOID") {
      const strictDenied = denyUnlessAuthorized(req, { strict: true });
      if (strictDenied) return strictDenied;
    }

    if (action === "CREATE_AUTHORIZATION") {
      // 1. Evaluate policy firewall before creating escrow authorization
      const policyCheck = evaluatePolicyFirewall({
        recipient: "Enterprise Hardware Supplier LLC",
        category,
        proposedAmountUsd: parseFloat(amountValue),
        layoutlmInvoiceTotalUsd: layoutlmInvoiceTotalUsd ? parseFloat(layoutlmInvoiceTotalUsd) : parseFloat(amountValue),
        paypalAuthorizedAmountUsd: parseFloat(amountValue),
        comprehensiveRiskScore: comprehensiveRiskScore ? parseFloat(comprehensiveRiskScore) : 0.12,
        promptText,
      });

      // Fail closed: any non-allowed policy result stops authorization, not only prompt injection.
      if (!policyCheck.allowed) {
        const injection = policyCheck.status === "BLOCKED_PROMPT_INJECTION";
        return NextResponse.json(
          {
            error: injection ? "Prompt Injection Blocked by Spend Firewall" : "Authorization Blocked by Policy Firewall",
            reasons: policyCheck.reasons,
            status: policyCheck.status,
          },
          { status: injection ? 403 : 422 }
        );
      }

      // NEEDS_APPROVAL is not a green light: an above-threshold hold needs a human operator.
      if (policyCheck.status === "NEEDS_APPROVAL") {
        const strictDenied = denyUnlessAuthorized(req, { strict: true });
        if (strictDenied) return strictDenied;
      }

      // 2. Dispatch PayPal Orders v2 with intent: "AUTHORIZE"
      const { data, trace } = await createEscrowAuthorizationOrder(
        accessToken,
        amountValue,
        currencyCode,
        customIntentId,
        requestId,
        mockErrorHeader
      );

      return NextResponse.json({
        success: trace.status < 400,
        action: "CREATE_AUTHORIZATION",
        order: data,
        policy: policyCheck,
        trace,
      });
    }

    if (action === "AUTHORIZE_ORDER") {
      const targetOrderId = orderId || body.id;
      if (!targetOrderId) {
        return NextResponse.json({ error: "orderId is required for AUTHORIZE_ORDER" }, { status: 400 });
      }

      const { data, trace } = await authorizeOrder(accessToken, targetOrderId, requestId);
      return NextResponse.json({
        success: trace.status < 400,
        action: "AUTHORIZE_ORDER",
        orderId: targetOrderId,
        result: data,
        trace,
      });
    }

    if (action === "GET_ORDER") {
      const targetOrderId = orderId || body.id;
      if (!targetOrderId) {
        return NextResponse.json({ error: "orderId is required for GET_ORDER" }, { status: 400 });
      }

      const { data, trace } = await getOrderDetails(accessToken, targetOrderId);
      return NextResponse.json({
        success: trace.status < 400,
        action: "GET_ORDER",
        orderId: targetOrderId,
        order: data,
        trace,
      });
    }

    if (action === "GET_AUTHORIZATION") {
      const targetAuthId = authorizationId || body.id;
      if (!targetAuthId) {
        return NextResponse.json({ error: "authorizationId is required for GET_AUTHORIZATION" }, { status: 400 });
      }

      const { data, trace } = await getAuthorizationDetails(accessToken, targetAuthId);
      return NextResponse.json({
        success: trace.status < 400,
        action: "GET_AUTHORIZATION",
        authorizationId: targetAuthId,
        authorization: data,
        trace,
      });
    }

    if (action === "CAPTURE" || action === "VOID") {
      if (!authorizationId) {
        return NextResponse.json({ error: "authorizationId is required for CAPTURE or VOID" }, { status: 400 });
      }

      const captureAmt = verifiedCaptureAmount || amountValue;

      // Deterministic policy evaluation for settlement
      const policyCheck = evaluatePolicyFirewall({
        recipient: "Enterprise Hardware Supplier LLC",
        category,
        proposedAmountUsd: parseFloat(amountValue),
        verifiedDeliveredAmountUsd: parseFloat(captureAmt),
        layoutlmInvoiceTotalUsd: layoutlmInvoiceTotalUsd ? parseFloat(layoutlmInvoiceTotalUsd) : parseFloat(captureAmt),
        paypalAuthorizedAmountUsd: parseFloat(amountValue),
        comprehensiveRiskScore: comprehensiveRiskScore ? parseFloat(comprehensiveRiskScore) : 0.12,
        promptText,
      });

      if (action === "CAPTURE" && !policyCheck.allowed) {
        return NextResponse.json(
          {
            error: "Settlement Blocked by Policy Firewall",
            reasons: policyCheck.reasons,
            status: policyCheck.status,
            policy: policyCheck,
          },
          { status: 422 }
        );
      }

      // Settle hold via PayPal Authorizations v2
      const effectiveCaptureAmount = policyCheck.allowedCaptureAmountUsd.toFixed(2);

      // Cap against PayPal's own record of the authorization: a client-supplied amount can never
      // exceed what the payer actually authorized (compared in integer cents).
      if (action === "CAPTURE") {
        const { data: authData, trace: authTrace } = await getAuthorizationDetails(accessToken, authorizationId);
        const authorized = (authData as { amount?: { value?: string } } | null)?.amount?.value;
        // Fail closed: if PayPal's own record of the authorization cannot be read, do not capture.
        if (authTrace.status >= 400 || authorized === undefined) {
          return NextResponse.json(
            { error: "Could not read the authorization from PayPal; capture refused.", trace: authTrace },
            { status: 502 }
          );
        }
        const authorizedCents = Math.round(Number(authorized) * 100);
        const captureCents = Math.round(Number(effectiveCaptureAmount) * 100);
        if (!Number.isFinite(authorizedCents) || captureCents > authorizedCents) {
          return NextResponse.json(
            {
              error: "Capture amount exceeds the amount PayPal reports as authorized.",
              authorizedAmount: authorized,
              requestedAmount: effectiveCaptureAmount,
            },
            { status: 422 }
          );
        }
      }
      const { data, trace } = await settleAuthorizationHold(
        accessToken,
        authorizationId,
        action,
        effectiveCaptureAmount,
        currencyCode,
        requestId
      );

      return NextResponse.json({
        success: trace.status < 400,
        action,
        settlement: data,
        policy: policyCheck,
        effectiveCaptureAmount,
        trace,
      });
    }

    return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

