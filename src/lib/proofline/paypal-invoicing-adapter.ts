import 'server-only';
import { getPayPalAccessToken, isUsingSimulatedToken, generateRequestId } from '@/lib/paypal-auth';
import type { CurrencyCode, ProoflineInvoiceStatus } from './types';

const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

export interface CreateInvoicePayload {
  projectId: string;
  milestoneId: string;
  scopeVersionId: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: CurrencyCode;
  clientEmail: string;
  clientBusinessName?: string;
  itemTitle: string;
  itemDescription?: string;
  note?: string;
}

export interface InvoiceAdapterResponse {
  success: boolean;
  providerInvoiceId: string | null;
  status: ProoflineInvoiceStatus;
  rawStatus?: string;
  hostedPaymentUrl?: string;
  paypalDebugId?: string;
  simulated: boolean;
  error?: string;
  warning?: string;
}

/**
 * Creates a real PayPal Invoicing v2 draft on Sandbox.
 * (POST /v2/invoicing/invoices)
 */
export async function createPayPalInvoiceOnSandbox(
  payload: CreateInvoicePayload
): Promise<InvoiceAdapterResponse> {
  const token = await getPayPalAccessToken();
  const isSimulated = isUsingSimulatedToken();
  const requestId = generateRequestId(`proof-inv-${payload.milestoneId}`);

  const majorAmount = (payload.amountMinor / 100).toFixed(2);

  if (isSimulated) {
    const simInvoiceId = `INV2-SIM-${Date.now().toString(36).toUpperCase()}`;
    return {
      success: true,
      providerInvoiceId: simInvoiceId,
      status: 'CREATED',
      rawStatus: 'DRAFT',
      hostedPaymentUrl: `https://www.sandbox.paypal.com/invoice/p/#${simInvoiceId}`,
      paypalDebugId: `SIM-DBG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      simulated: true,
    };
  }

  const invoiceBody = {
    detail: {
      invoice_number: payload.invoiceNumber,
      currency_code: payload.currency,
      note: payload.note || 'Issued via Proofline Versioned Escrow & Milestone System',
      payment_term: {
        term_type: 'DUE_ON_RECEIPT',
      },
    },
    invoicer: {
      business_name: 'Independent Freelance Studio',
    },
    primary_recipients: [
      {
        billing_info: {
          email_address: payload.clientEmail,
          business_name: payload.clientBusinessName || 'Valued Client',
        },
      },
    ],
    items: [
      {
        name: payload.itemTitle,
        description: payload.itemDescription || `Delivery for milestone ${payload.milestoneId}`,
        quantity: '1',
        unit_amount: {
          currency_code: payload.currency,
          value: majorAmount,
        },
      },
    ],
    // No top-level `amount`: PayPal computes it from items. Sending it without a
    // full breakdown triggers 400 INVALID_REQUEST /amount/value calculation_error.
    configuration: {
      allow_tip: false,
      tax_calculated_after_discount: true,
      tax_inclusive: false,
    },
  };

  try {
    const res = await fetch(`${PAYPAL_BASE_URL}/v2/invoicing/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'PayPal-Request-Id': requestId,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(invoiceBody),
    });

    const debugId = res.headers.get('paypal-debug-id') || undefined;

    if (!res.ok) {
      const errText = await res.text();

      // 401/403: the sandbox REST app lacks the Invoicing feature/permission.
      // Fall back to a clearly-labeled simulated invoice so the demo keeps working.
      if (res.status === 401 || res.status === 403) {
        const simInvoiceId = `INV2-SIM-${Date.now().toString(36).toUpperCase()}`;
        return {
          success: true,
          providerInvoiceId: simInvoiceId,
          status: 'CREATED',
          rawStatus: 'DRAFT',
          hostedPaymentUrl: `https://www.sandbox.paypal.com/invoice/p/#${simInvoiceId}`,
          paypalDebugId: debugId,
          simulated: true,
          warning:
            `PayPal rejected Invoicing (${res.status}); using a SIMULATED invoice. ` +
            `Enable "Invoicing" on the sandbox REST app (developer.paypal.com > Apps & Credentials) for live calls. ` +
            errText.slice(0, 200),
        };
      }

      return {
        success: false,
        providerInvoiceId: null,
        status: 'FAILED_OR_UNKNOWN',
        paypalDebugId: debugId,
        simulated: false,
        error: `PayPal Invoicing API error (${res.status}): ${errText.slice(0, 300)}`,
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const invId = (data.id as string) || (data.invoice_id as string);

    // Only the payer-view link is a browser URL; `self` points at the REST API.
    const links = data.links as Array<{ rel?: string; href?: string }> | undefined;
    const paymentLink = links?.find((l) => l.rel === 'payer-view');
    const detail = data.detail as { metadata?: { recipient_view_url?: string } } | undefined;

    return {
      success: true,
      providerInvoiceId: invId,
      status: 'CREATED',
      rawStatus: (data.status as string) || 'DRAFT',
      hostedPaymentUrl:
        paymentLink?.href ||
        detail?.metadata?.recipient_view_url ||
        `https://www.sandbox.paypal.com/invoice/p/#${invId}`,
      paypalDebugId: debugId,
      simulated: false,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      providerInvoiceId: null,
      status: 'FAILED_OR_UNKNOWN',
      simulated: false,
      error: `Network failure connecting to PayPal Invoicing: ${msg}`,
    };
  }
}

/**
 * Sends a created PayPal Invoice to the recipient.
 * (POST /v2/invoicing/invoices/{id}/send)
 */
export async function sendPayPalInvoiceOnSandbox(
  providerInvoiceId: string
): Promise<InvoiceAdapterResponse> {
  const token = await getPayPalAccessToken();
  const isSimulated = isUsingSimulatedToken() || (providerInvoiceId.includes('SIM') || providerInvoiceId.includes('PRFL'));
  const requestId = generateRequestId(`send-${providerInvoiceId}`);

  if (isSimulated) {
    return {
      success: true,
      providerInvoiceId,
      status: 'SENT',
      rawStatus: 'SENT',
      hostedPaymentUrl: `https://www.sandbox.paypal.com/invoice/p/#${providerInvoiceId}`,
      simulated: true,
    };
  }

  try {
    const res = await fetch(`${PAYPAL_BASE_URL}/v2/invoicing/invoices/${encodeURIComponent(providerInvoiceId)}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'PayPal-Request-Id': requestId,
      },
      body: JSON.stringify({
        send_to_recipient: true,
      }),
    });

    const debugId = res.headers.get('paypal-debug-id') || undefined;

    if (!res.ok && res.status !== 202 && res.status !== 200) {
      const errText = await res.text();
      return {
        success: false,
        providerInvoiceId,
        status: 'CREATED',
        paypalDebugId: debugId,
        simulated: false,
        error: `Failed to send PayPal invoice: ${errText.slice(0, 300)}`,
      };
    }

    // Send responds with { links: [{ rel: 'payer-view', href }] } (body may be empty on 202).
    let payerViewUrl: string | undefined;
    try {
      const sent = (await res.json()) as { links?: Array<{ rel?: string; href?: string }>; href?: string };
      payerViewUrl = sent.links?.find((l) => l.rel === 'payer-view')?.href || sent.href;
    } catch {
      /* empty body */
    }

    return {
      success: true,
      providerInvoiceId,
      status: 'SENT',
      rawStatus: 'SENT',
      hostedPaymentUrl: payerViewUrl,
      paypalDebugId: debugId,
      simulated: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      providerInvoiceId,
      status: 'CREATED',
      simulated: false,
      error: `Failed to dispatch invoice: ${msg}`,
    };
  }
}

/**
 * Performs authoritative server-side readback of invoice status directly from PayPal.
 * (GET /v2/invoicing/invoices/{id})
 */
export async function readbackPayPalInvoice(
  providerInvoiceId: string
): Promise<{
  success: boolean;
  status: ProoflineInvoiceStatus;
  rawStatus: string;
  amountMinor?: number;
  paidAmountMinor?: number;
  paypalDebugId?: string;
  simulated: boolean;
  error?: string;
}> {
  const token = await getPayPalAccessToken();
  const isSimulated = isUsingSimulatedToken() || (providerInvoiceId.includes('SIM') || providerInvoiceId.includes('PRFL'));

  if (isSimulated) {
    // In simulated sandbox, we return the status based on current mock lifecycle
    return {
      success: true,
      status: 'SENT',
      rawStatus: 'SENT',
      simulated: true,
    };
  }

  try {
    const res = await fetch(`${PAYPAL_BASE_URL}/v2/invoicing/invoices/${encodeURIComponent(providerInvoiceId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const debugId = res.headers.get('paypal-debug-id') || undefined;

    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        status: 'FAILED_OR_UNKNOWN',
        rawStatus: `HTTP_${res.status}`,
        paypalDebugId: debugId,
        simulated: false,
        error: `PayPal readback returned HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const rawStatus = (data.status as string) || 'UNKNOWN';

    // Map PayPal Invoice status to ProoflineInvoiceStatus
    let mappedStatus: ProoflineInvoiceStatus = 'SENT';
    if (rawStatus === 'PAID' || rawStatus === 'MARKED_AS_PAID') {
      mappedStatus = 'PAID';
    } else if (rawStatus === 'PARTIALLY_PAID') {
      mappedStatus = 'PARTIALLY_PAID';
    } else if (rawStatus === 'CANCELLED') {
      mappedStatus = 'CANCELLED';
    } else if (rawStatus === 'REFUNDED' || rawStatus === 'PARTIALLY_REFUNDED') {
      mappedStatus = 'REFUNDED';
    } else if (rawStatus === 'DRAFT') {
      mappedStatus = 'CREATED';
    }

    const amountObj = data.amount as { value?: string } | undefined;
    const paymentsObj = data.payments as { paid_amount?: { value?: string } } | undefined;
    const totalVal = amountObj?.value ? parseFloat(amountObj.value) : undefined;
    const paidVal = paymentsObj?.paid_amount?.value ? parseFloat(paymentsObj.paid_amount.value) : undefined;

    return {
      success: true,
      status: mappedStatus,
      rawStatus,
      amountMinor: totalVal ? Math.round(totalVal * 100) : undefined,
      paidAmountMinor: paidVal ? Math.round(paidVal * 100) : undefined,
      paypalDebugId: debugId,
      simulated: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      status: 'FAILED_OR_UNKNOWN',
      rawStatus: 'ERROR',
      simulated: false,
      error: `Network failure during readback: ${msg}`,
    };
  }
}


/**
 * Records an external payment against a real sandbox invoice so PayPal's own
 * status becomes MARKED_AS_PAID / PAID and server-side reconcile agrees.
 * (POST /v2/invoicing/invoices/{id}/payments)
 */
export async function recordPayPalInvoicePayment(
  providerInvoiceId: string,
  amountMinor: number,
  currency: CurrencyCode
): Promise<{ success: boolean; simulated: boolean; paypalDebugId?: string; error?: string }> {
  const token = await getPayPalAccessToken();
  const isSimulated =
    isUsingSimulatedToken() || providerInvoiceId.includes('SIM') || providerInvoiceId.includes('PRFL');
  if (isSimulated) return { success: true, simulated: true };

  try {
    const res = await fetch(
      `${PAYPAL_BASE_URL}/v2/invoicing/invoices/${encodeURIComponent(providerInvoiceId)}/payments`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'PayPal-Request-Id': generateRequestId(`pay-${providerInvoiceId}`),
        },
        body: JSON.stringify({
          method: 'PAYPAL',
          payment_date: new Date().toISOString().slice(0, 10),
          amount: { currency_code: currency, value: (amountMinor / 100).toFixed(2) },
          note: 'Sandbox client payment recorded by Proofline demo',
        }),
      }
    );
    const debugId = res.headers.get('paypal-debug-id') || undefined;
    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        simulated: false,
        paypalDebugId: debugId,
        error: `PayPal record-payment error (${res.status}): ${text.slice(0, 300)}`,
      };
    }
    return { success: true, simulated: false, paypalDebugId: debugId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, simulated: false, error: `Network failure recording payment: ${msg}` };
  }
}
