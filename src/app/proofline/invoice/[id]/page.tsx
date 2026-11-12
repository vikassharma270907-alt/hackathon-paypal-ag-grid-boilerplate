import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prooflineStore } from '@/lib/proofline/store';
import type { ProoflineInvoice } from '@/lib/proofline/types';

export const dynamic = 'force-dynamic';

/** Invoice IDs that never reached PayPal (fallback or seeded demo data). */
function isSimulatedInvoice(inv: ProoflineInvoice): boolean {
  const pid = inv.providerInvoiceId || '';
  return !pid || pid.includes('SIM') || pid.includes('PRFL');
}

function money(minor: number, currency: string): string {
  return `$${(minor / 100).toFixed(2)} ${currency}`;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function InvoiceViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);

  // Accept either the local invoice id or the PayPal provider invoice id.
  const invoice =
    prooflineStore.invoices.get(decoded) ||
    Array.from(prooflineStore.invoices.values()).find((i) => i.providerInvoiceId === decoded);

  if (!invoice) notFound();

  const project = prooflineStore.projects.get(invoice.projectId);
  const scopes = prooflineStore.scopeVersions.get(invoice.projectId) || [];
  const milestone = scopes
    .flatMap((s) => s.content?.milestones || [])
    .find((m) => m.id === invoice.milestoneId);

  const simulated = isSimulatedInvoice(invoice);
  const paid = invoice.status === 'PAID';
  const itemTitle = milestone?.title || `Payment for milestone ${invoice.milestoneId}`;

  const statusStyle = paid
    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
    : invoice.status === 'SENT'
    ? 'bg-blue-100 text-blue-800 border-blue-300'
    : 'bg-zinc-100 text-zinc-700 border-zinc-300';

  return (
    <main className="min-h-screen bg-[#f5f7fa] py-10 px-4 text-[#2c2e2f]">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between text-sm">
          <Link href="/proofline" className="text-[#0070ba] hover:underline">
            ← Back to Proofline
          </Link>
          {!simulated && invoice.hostedPaymentUrl && (
            <a
              href={invoice.hostedPaymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#0070ba] hover:underline"
            >
              Open on PayPal Sandbox ↗
            </a>
          )}
        </div>

        {simulated && (
          <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Sandbox simulation.</strong> This invoice was generated locally because the PayPal sandbox app
            does not have Invoicing permission (PayPal returned 403 NOT_AUTHORIZED). Layout and data mirror the
            PayPal Invoicing v2 payload this app sends to <code>POST /v2/invoicing/invoices</code>.
          </div>
        )}

        <article className="rounded-xl bg-white shadow-md border border-zinc-200 overflow-hidden">
          {/* Header */}
          <header className="flex items-start justify-between border-b border-zinc-200 p-6">
            <div>
              <div className="flex items-baseline gap-1 text-2xl font-extrabold italic" aria-label="PayPal">
                <span className="text-[#003087]">Pay</span>
                <span className="text-[#009cde]">Pal</span>
                <span className="ml-2 not-italic text-xs font-semibold text-zinc-500">Sandbox Invoice</span>
              </div>
              <p className="mt-3 text-sm font-semibold">{project?.freelancerName || 'Independent Freelance Studio'}</p>
              <p className="text-xs text-zinc-500">Bangalore, IN</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Invoice</p>
              <p className="font-mono text-sm font-bold">{invoice.invoiceNumber}</p>
              <span className={`mt-2 inline-block rounded border px-2 py-0.5 text-[11px] font-bold ${statusStyle}`}>
                {invoice.status}
              </span>
              {simulated && (
                <span className="ml-1 mt-2 inline-block rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  SIMULATED
                </span>
              )}
            </div>
          </header>

          {/* Parties & meta */}
          <section className="grid grid-cols-1 gap-6 border-b border-zinc-200 p-6 sm:grid-cols-3 text-sm">
            <div>
              <h2 className="text-xs uppercase tracking-wide text-zinc-500">Bill to</h2>
              <p className="mt-1 font-semibold">{invoice.recipientBusinessName || project?.clientName}</p>
              <p className="text-zinc-600">{invoice.recipientEmail}</p>
            </div>
            <div>
              <h2 className="text-xs uppercase tracking-wide text-zinc-500">Invoice date</h2>
              <p className="mt-1">{fmtDate(invoice.createdAt)}</p>
              <h2 className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Payment terms</h2>
              <p className="mt-1">Due on receipt</p>
            </div>
            <div>
              <h2 className="text-xs uppercase tracking-wide text-zinc-500">PayPal invoice ID</h2>
              <p className="mt-1 font-mono text-xs break-all">{invoice.providerInvoiceId}</p>
              <h2 className="mt-3 text-xs uppercase tracking-wide text-zinc-500">Scope version</h2>
              <p className="mt-1 font-mono text-xs break-all">{invoice.scopeVersionId}</p>
            </div>
          </section>

          {/* Line items */}
          <section className="p-6">
            <table className="w-full text-sm">
              <caption className="sr-only">Invoice line items</caption>
              <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="pb-2">Description</th>
                  <th scope="col" className="pb-2 text-right">Qty</th>
                  <th scope="col" className="pb-2 text-right">Price</th>
                  <th scope="col" className="pb-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-100">
                  <td className="py-3">
                    <p className="font-semibold">{itemTitle}</p>
                    <p className="text-xs text-zinc-500">
                      {project?.title ? `${project.title} · ` : ''}Milestone {invoice.milestoneId}
                    </p>
                  </td>
                  <td className="py-3 text-right">1</td>
                  <td className="py-3 text-right">{money(invoice.amountMinor, invoice.currency)}</td>
                  <td className="py-3 text-right font-semibold">{money(invoice.amountMinor, invoice.currency)}</td>
                </tr>
              </tbody>
            </table>

            <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Subtotal</dt>
                <dd>{money(invoice.amountMinor, invoice.currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>{money(invoice.amountMinor, invoice.currency)}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-zinc-500">Amount due</dt>
                <dd className="font-semibold">{paid ? money(0, invoice.currency) : money(invoice.amountMinor, invoice.currency)}</dd>
              </div>
            </dl>
          </section>

          {/* Payment block */}
          <footer className="border-t border-zinc-200 bg-zinc-50 p-6">
            {paid ? (
              <p className="text-center text-sm font-semibold text-emerald-700">
                ✓ Paid {invoice.paidAt ? `on ${fmtDate(invoice.paidAt)}` : ''} · Reconciled via server-side readback
              </p>
            ) : (
              <div className="space-y-2 text-center">
                {!simulated && invoice.hostedPaymentUrl ? (
                  <a
                    href={invoice.hostedPaymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block w-full max-w-xs rounded-full bg-[#ffc439] py-2.5 font-bold text-[#003087] hover:brightness-95"
                  >
                    Pay with PayPal
                  </a>
                ) : (
                  <span
                    aria-disabled="true"
                    className="inline-block w-full max-w-xs rounded-full bg-[#ffc439]/60 py-2.5 font-bold text-[#003087]/70"
                  >
                    Pay with PayPal
                  </span>
                )}
                <p className="text-xs text-zinc-500">
                  {simulated
                    ? 'Use "Simulate Client Payment" in Proofline to settle this sandbox invoice.'
                    : 'Opens the PayPal-hosted sandbox payer view.'}
                </p>
              </div>
            )}
            <p className="mt-4 text-center text-[11px] text-zinc-400">
              Last readback: {fmtDate(invoice.lastReadbackAt)} · Raw status: {invoice.readbackRawStatus || '—'}
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}
