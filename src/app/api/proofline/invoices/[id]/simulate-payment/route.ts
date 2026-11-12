import { NextRequest, NextResponse } from 'next/server';
import { prooflineStore } from '@/lib/proofline/store';
import { recordPayPalInvoicePayment } from '@/lib/proofline/paypal-invoicing-adapter';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await context.params;
    const invoice = prooflineStore.invoices.get(invoiceId);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // For real sandbox invoices, record the payment on PayPal so reconcile reads PAID.
    if (invoice.providerInvoiceId) {
      const rec = await recordPayPalInvoicePayment(invoice.providerInvoiceId, invoice.amountMinor, invoice.currency);
      if (!rec.success) {
        return NextResponse.json({ error: rec.error, paypalDebugId: rec.paypalDebugId }, { status: 502 });
      }
    }

    const paidAt = new Date().toISOString();
    invoice.status = 'PAID';
    invoice.paidAt = paidAt;
    invoice.lastReadbackAt = paidAt;
    invoice.readbackRawStatus = 'PAID';

    // Update corresponding milestone status to PAID
    const project = prooflineStore.projects.get(invoice.projectId);
    if (project) {
      const versions = prooflineStore.scopeVersions.get(invoice.projectId) || [];
      const activeScope = versions.find((v) => v.id === project.activeScopeVersionId);
      if (activeScope) {
        const milestone = activeScope.content.milestones.find((m) => m.id === invoice.milestoneId);
        if (milestone) {
          milestone.status = 'PAID';
        }
      }
    }

    prooflineStore.appendAuditEntry(
      invoice.projectId,
      'PayPal Sandbox Webhook Listener',
      'PAYPAL_WEBHOOK',
      'PAYMENT_SETTLED_INVOICE_PAID',
      'PAYMENT',
      invoice.id,
      'PAYPAL_CONFIRMED',
      {
        providerInvoiceId: invoice.providerInvoiceId,
        amountMinor: invoice.amountMinor,
        currency: invoice.currency,
        paidAt,
        method: 'PAYPAL_SANDBOX_CHECKOUT',
      }
    );

    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

