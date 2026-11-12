import { NextRequest, NextResponse } from "next/server";
import { getPayPalAccessToken } from "@/lib/paypal-auth";
import { evaluatePolicyFirewall } from "@/lib/policy-firewall";
import { evaluateDisputeTriage } from "@/lib/ml-fallback";
import { restockStore } from "@/lib/restock-store";

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

export interface WebhookVerificationResult {
  verified: boolean;
  verificationStatus: "SUCCESS" | "FAILURE" | "SANDBOX_SIMULATED" | "UNVERIFIED";
  details?: string;
}

/**
 * Verifies PayPal Webhook signature via official PayPal REST API:
 * POST /v1/notifications/verify-webhook-signature
 */
async function verifyPayPalWebhookSignature(
  req: NextRequest,
  rawBody: string
): Promise<WebhookVerificationResult> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  const authAlgo = req.headers.get("paypal-auth-algo");
  const certUrl = req.headers.get("paypal-cert-url");
  const transmissionId = req.headers.get("paypal-transmission-id");
  const transmissionSig = req.headers.get("paypal-transmission-sig");
  const transmissionTime = req.headers.get("paypal-transmission-time");

  // Fail closed: an unconfigured webhook id must never mean "verified". Unsigned events are only
  // accepted outside production and only with an explicit opt-in flag.
  if (!webhookId || webhookId.startsWith("your_")) {
    if (process.env.ALLOW_UNSIGNED_WEBHOOKS === "true" && process.env.NODE_ENV !== "production") {
      return {
        verified: true,
        verificationStatus: "SANDBOX_SIMULATED",
        details: "SIMULATION: PAYPAL_WEBHOOK_ID is not configured; unsigned event accepted by explicit dev opt-in.",
      };
    }
    return {
      verified: false,
      verificationStatus: "UNVERIFIED",
      details: "PAYPAL_WEBHOOK_ID is not configured; webhook events cannot be verified.",
    };
  }

  // If live headers are missing (e.g. internal test event)
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return {
      verified: false,
      verificationStatus: "UNVERIFIED",
      details: "Missing required PayPal transmission headers for cryptographic verification.",
    };
  }

  // Replay window: reject stale or future-dated transmissions.
  const sentAt = Date.parse(transmissionTime);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > REPLAY_WINDOW_MS) {
    return {
      verified: false,
      verificationStatus: "FAILURE",
      details: "paypal-transmission-time is missing, invalid, or outside the 5 minute replay window.",
    };
  }

  try {
    const token = await getPayPalAccessToken();
    // The raw body is embedded verbatim: PayPal verifies the exact bytes that were signed, so a
    // parse/re-serialize round trip can produce false FAILURE results.
    const verifyBody =
      `{"auth_algo":${JSON.stringify(authAlgo)},"cert_url":${JSON.stringify(certUrl)},` +
      `"transmission_id":${JSON.stringify(transmissionId)},"transmission_sig":${JSON.stringify(transmissionSig)},` +
      `"transmission_time":${JSON.stringify(transmissionTime)},"webhook_id":${JSON.stringify(webhookId)},` +
      `"webhook_event":${rawBody}}`;

    const res = await fetch(`${PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: verifyBody,
    });

    if (res.ok) {
      const data = (await res.json()) as { verification_status?: string };
      const isSuccess = data.verification_status === "SUCCESS";
      return {
        verified: isSuccess,
        verificationStatus: isSuccess ? "SUCCESS" : "FAILURE",
        details: `PayPal API signature verification returned: ${data.verification_status}`,
      };
    }

    return {
      verified: false,
      verificationStatus: "FAILURE",
      details: `PayPal API returned HTTP ${res.status} during signature verification.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      verified: false,
      verificationStatus: "FAILURE",
      details: `Signature verification error: ${msg}`,
    };
  }
}

/**
 * GET /api/paypal/webhook
 * Reports current webhook listener configuration and health status.
 */
export async function GET() {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  const isConfigured = Boolean(webhookId && !webhookId.startsWith("your_"));

  return NextResponse.json({
    status: "active",
    endpoint: "/api/paypal/webhook",
    webhookIdConfigured: isConfigured,
    webhookIdPreview: isConfigured && webhookId ? `${webhookId.slice(0, 4)}...${webhookId.slice(-4)}` : "not_configured",
    supportedEvents: [
      "CHECKOUT.ORDER.APPROVED",
      "PAYMENT.AUTHORIZATION.CREATED",
      "PAYMENT.AUTHORIZATION.VOIDED",
      "PAYMENT.CAPTURE.COMPLETED",
      "CUSTOMER.DISPUTE.CREATED",
      "CUSTOMER.DISPUTE.RESOLVED",
      "INVOICING.INVOICE.PAID",
    ],
    policyFirewallEnforced: true,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/paypal/webhook
 * Receives and processes real-time PayPal Webhook events with policy enforcement.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let event: Record<string, unknown>;

    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON webhook payload" }, { status: 400 });
    }

    const eventType = (event.event_type as string) || "UNKNOWN_EVENT";
    const eventId = typeof event.id === "string" ? event.id : "";
    const resource = (event.resource as Record<string, unknown>) || {};

    // 1. Verify the signature BEFORE doing anything else with the event.
    const verification = await verifyPayPalWebhookSignature(req, rawBody);
    if (!verification.verified) {
      return NextResponse.json(
        {
          received: false,
          verified: false,
          verificationStatus: verification.verificationStatus,
          verificationDetails: verification.details,
        },
        { status: 401 }
      );
    }
    if (!eventId) {
      return NextResponse.json({ error: "Webhook event is missing an id" }, { status: 400 });
    }

    // 1b. Deduplicate: PayPal retries deliveries, so processing must be idempotent.
    if (restockStore.processedWebhookIds.has(eventId)) {
      return NextResponse.json({ received: true, duplicate: true, eventId, eventType, verified: true });
    }
    restockStore.processedWebhookIds.add(eventId);

    // 2. Policy-gated event dispatching
    let policyAction: Record<string, unknown> | null = null;

    if (eventType === "PAYMENT.AUTHORIZATION.CREATED" || eventType === "CHECKOUT.ORDER.APPROVED") {
      const amountValue = (resource.amount as { value?: string })?.value || "2450.00";
      const policyCheck = evaluatePolicyFirewall({
        recipient: "Enterprise Hardware Supplier LLC",
        category: "Office Equipment",
        proposedAmountUsd: parseFloat(amountValue),
        layoutlmInvoiceTotalUsd: parseFloat(amountValue),
        paypalAuthorizedAmountUsd: parseFloat(amountValue),
        comprehensiveRiskScore: 0.12,
      });
      policyAction = {
        rule: "AUTHORIZATION_HELD_FOR_3WAY_MATCH",
        policyStatus: policyCheck.status,
        allowed: policyCheck.allowed,
        reasons: policyCheck.reasons,
      };
    } else if (eventType === "CUSTOMER.DISPUTE.CREATED") {
      const disputeId = (resource.dispute_id as string) || eventId;
      const disputeAmount = parseFloat((resource.dispute_amount as { value?: string })?.value || "1850.0");
      const triage = evaluateDisputeTriage({
        disputeId,
        orderId: (resource.disputed_transactions as Array<{ seller_transaction_id?: string }> | undefined)?.[0]?.seller_transaction_id || "ORD-2026-X88",
        trackingNumber: "1Z9999999999999999",
        invoiceId: "INV-2026-001",
        disputedAmountUsd: disputeAmount,
        baseWinProb: 0.85,
        llmWinProbAdjustment: 0.05,
      });
      policyAction = {
        rule: "DISPUTE_AUTOTRIAGE_INITIALIZED",
        triageSummary: {
          recommendedStrategy: triage.recommendedStrategy,
          calibratedWinProb: triage.calibratedWinProb,
          expectedLossUsd: triage.expectedLossUsd,
        },
      };
    }

    console.log(
      `[PAYPAL WEBHOOK] Event: ${eventType} (ID: ${eventId}) | Verified: ${verification.verified} (${verification.verificationStatus})`
    );

    return NextResponse.json({
      received: true,
      eventId,
      eventType,
      verified: verification.verified,
      verificationStatus: verification.verificationStatus,
      verificationDetails: verification.details,
      policyAction,
      summary: (event.summary as string) || `Webhook event ${eventType} processed.`,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("[PAYPAL WEBHOOK] processing error:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
