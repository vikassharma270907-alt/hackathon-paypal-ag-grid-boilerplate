import { NextRequest, NextResponse } from "next/server";
import { getPayPalAccessToken, generateRequestId } from "@/lib/paypal-auth";
import { createB2BInvoice } from "@/lib/paypal-escrow-disputes";
import { evaluateEarlyDiscountSkepticGate } from "@/lib/ml-fallback";
import { denyUnlessAuthorized, rejectOversizedBody } from "@/lib/api-guard";
import { isValidMoney, isBoundedString } from "@/lib/validation";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

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
    if (body.invoiceValue !== undefined && !isValidMoney(body.invoiceValue)) {
      return NextResponse.json({ error: "invoiceValue must be a positive amount with at most 2 decimals." }, { status: 400 });
    }
    for (const field of ["pOnTime", "annualCapitalCost"] as const) {
      const v = body[field];
      if (v !== undefined && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 1)) {
        return NextResponse.json({ error: `${field} must be between 0 and 1.` }, { status: 400 });
      }
    }
    if (body.recipientEmail !== undefined && !(typeof body.recipientEmail === "string" && EMAIL_RE.test(body.recipientEmail))) {
      return NextResponse.json({ error: "recipientEmail is not a valid email address." }, { status: 400 });
    }
    if (body.itemName !== undefined && !isBoundedString(body.itemName, 120)) {
      return NextResponse.json({ error: "itemName must be a string of at most 120 characters." }, { status: 400 });
    }
    const {
      action = "EVALUATE_AND_CREATE",
      invoiceValue = 2500.0,
      pOnTime = 0.92,
      annualCapitalCost = 0.15,
      recipientEmail = "buyer@enterprise-demo.com",
      itemName = "Cloud Hardware Node Alpha",
    } = body;

    // 1. Evaluate Early-Payment Discount "Skeptic Gate"
    const skepticResult = evaluateEarlyDiscountSkepticGate({
      invoiceValueUsd: parseFloat(String(invoiceValue)),
      pOnTimeClient: parseFloat(String(pOnTime)),
      annualCapitalCost: parseFloat(String(annualCapitalCost)),
      discountRate: 0.02,
      accelerationDays: 20,
    });

    if (action === "EVALUATE_ONLY") {
      return NextResponse.json({
        action: "EVALUATE_ONLY",
        skepticGate: skepticResult,
      });
    }

    // 2. Dispatch PayPal Invoicing v2 with or without discount based on Skeptic Gate
    const accessToken = await getPayPalAccessToken();
    const requestId = generateRequestId("inv");

    // Integer cents avoid binary floating point drift on money.
    const totalCents = Math.round(Number(invoiceValue) * 100);
    const effectiveCents =
      skepticResult.decision === "PROPOSE_DISCOUNT" ? Math.round((totalCents * 98) / 100) : totalCents;
    const effectiveTotal = (effectiveCents / 100).toFixed(2);

    const invoicePayload = {
      detail: {
        invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
        currency_code: "USD",
        note:
          skepticResult.decision === "PROPOSE_DISCOUNT"
            ? "Terms: 2/10 Net 30 (Skeptic Gate Approved)"
            : "Terms: Due in 30 Days (Skeptic Gate Preserved Full Margin)",
        payment_term: {
          term_type: skepticResult.decision === "PROPOSE_DISCOUNT" ? "NET_10" : "NET_30",
        },
      },
      primary_recipients: [
        {
          billing_info: {
            email_address: recipientEmail,
          },
        },
      ],
      items: [
        {
          name: itemName,
          quantity: "1",
          unit_amount: { currency_code: "USD", value: effectiveTotal },
        },
      ],
      amount: {
        currency_code: "USD",
        value: effectiveTotal,
      },
    };

    const { data, trace } = await createB2BInvoice(accessToken, invoicePayload, requestId);

    return NextResponse.json({
      action: "EVALUATE_AND_CREATE",
      skepticGate: skepticResult,
      invoice: data,
      trace,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

