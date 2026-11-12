'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Lock, ShieldCheck } from 'lucide-react';
import type { Basket } from '@/lib/basket';
import type { RestockClaim, RestockPurchaseOrder } from '@/lib/restock-store';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

interface Props {
  purchaseOrders: RestockPurchaseOrder[];
  claims: RestockClaim[];
  onChanged: () => Promise<void> | void;
}

const STATUS_STYLE: Record<string, string> = {
  AWAITING_BUYER_APPROVAL: 'bg-amber-950 text-amber-300 border-amber-700',
  AUTHORIZED: 'bg-blue-950 text-blue-300 border-blue-700',
  SETTLED: 'bg-emerald-950 text-emerald-300 border-emerald-700',
  VOIDED: 'bg-zinc-900 text-zinc-300 border-zinc-700',
  UNKNOWN: 'bg-purple-950 text-purple-300 border-purple-700',
  FAILED: 'bg-red-950 text-red-300 border-red-700',
  SETTLING: 'bg-blue-950 text-blue-300 border-blue-700',
  ORDER_CREATING: 'bg-zinc-900 text-zinc-300 border-zinc-700',
};

export function BasketPanel({ purchaseOrders, claims, onChanged }: Props) {
  const [baskets, setBaskets] = useState<Basket[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/restock/basket');
    if (res.ok) setBaskets(((await res.json()) as { baskets: Basket[] }).baskets);
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch('/api/restock/basket')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { baskets: Basket[] } | null) => {
        if (!ignore && j) setBaskets(j.baskets);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [purchaseOrders.length, claims.length]);

  const inOpenBasket = new Set(
    baskets.filter((b) => !['SETTLED', 'VOIDED', 'FAILED'].includes(b.status)).flatMap((b) => b.lines.map((l) => l.poId)),
  );
  const claimed = new Set(
    claims.filter((c) => !['DECLINED', 'FAILED', 'REFUNDED'].includes(c.status)).map((c) => c.poId),
  );
  const eligible = purchaseOrders.filter(
    (po) => po.decision !== 'BLOCK' && !claimed.has(po.id) && !inOpenBasket.has(po.id),
  );

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/restock/basket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? 'Request failed');
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const eligibleTotal = eligible.filter((p) => selected.has(p.id)).reduce((s, p) => s + p.totalPrice, 0);

  return (
    <section aria-labelledby="basket-heading">
      <h2 id="basket-heading" className="text-base font-bold text-white flex items-center gap-2">
        <Lock className="size-4 text-blue-400" />
        2b. Hold once, approve line by line, capture only what you approve
      </h2>
      <p className="text-xs text-zinc-400 mt-0.5 mb-3">
        One PayPal authorization holds the basket. Each line you approve is captured with{' '}
        <code className="font-mono">final_capture: true</code>; PayPal releases the rest. A hold is temporary and is
        not escrow.
      </p>

      {error && (
        <div role="alert" className="mb-3 rounded-lg border border-red-800 bg-red-950/50 p-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {eligible.length > 0 && (
        <fieldset className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 mb-3">
          <legend className="px-1 text-xs font-semibold text-zinc-300">Lines available for a basket</legend>
          <ul className="space-y-1">
            {eligible.map((po) => (
              <li key={po.id}>
                <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(po.id)}
                    onChange={() => setSelected((s) => toggle(s, po.id))}
                    className="accent-blue-500"
                  />
                  <span className="font-mono">{po.sku}</span>
                  <span className="text-zinc-400">
                    {po.qty} × ${po.unitPrice.toFixed(2)} = ${po.totalPrice.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-zinc-500">{po.decision}</span>
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => {
              void call({ action: 'CREATE', poIds: Array.from(selected) }).then(() => setSelected(new Set()));
            }}
            className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Hold selected lines ({selected.size}, ${eligibleTotal.toFixed(2)}) with PayPal
          </button>
        </fieldset>
      )}

      {eligible.length === 0 && baskets.length === 0 && (
        <p className="text-xs text-zinc-500">Run the café restock cycle above to create lines you can hold together.</p>
      )}

      <div className="space-y-3">
        {baskets.map((b) => {
          const chosen = approved[b.id] ?? new Set<string>();
          const chosenCents = b.lines.filter((l) => chosen.has(l.poId)).reduce((s, l) => s + l.lineCents, 0);
          return (
            <article key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-xs space-y-2">
              <header className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold text-white">{b.id}</span>
                <span className={`rounded border px-2 py-0.5 font-bold ${STATUS_STYLE[b.status] ?? ''}`}>{b.status}</span>
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-zinc-300">
                  {b.mode === 'SANDBOX' ? 'PayPal Sandbox' : 'SIMULATED (no PayPal call)'}
                </span>
                <span className="ml-auto font-mono text-zinc-300">Hold: {usd(b.totalCents)}</span>
              </header>
              <p className="font-mono text-[10px] text-zinc-500 break-all">contract hash (PayPal custom_id): {b.contractHash}</p>

              {b.status === 'AWAITING_BUYER_APPROVAL' && (
                <div className="flex flex-wrap items-center gap-2">
                  {b.approveUrl && b.mode === 'SANDBOX' && (
                    <a
                      href={b.approveUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 font-semibold text-white hover:bg-zinc-700"
                    >
                      Approve hold on PayPal <ExternalLink className="size-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void call({ action: 'AUTHORIZE', basketId: b.id })}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
                  >
                    Confirm hold (verify APPROVED, then authorize)
                  </button>
                </div>
              )}

              {(b.status === 'AUTHORIZED' || b.status === 'UNKNOWN') && b.authorizationId && (
                <div>
                  <p className="mb-1 text-zinc-300">Approve each line. Unticked lines are released, never charged.</p>
                  <ul className="space-y-1">
                    {b.lines.map((l) => (
                      <li key={l.poId}>
                        <label className="flex items-center gap-2 cursor-pointer text-zinc-200">
                          <input
                            type="checkbox"
                            checked={chosen.has(l.poId)}
                            onChange={() => setApproved((a) => ({ ...a, [b.id]: toggle(chosen, l.poId) }))}
                            className="accent-emerald-500"
                          />
                          <span className="font-mono">{l.sku}</span>
                          <span className="text-zinc-400">
                            {l.qty} × {usd(l.unitPriceCents)} = {usd(l.lineCents)}
                          </span>
                          <span className="text-[10px] text-zinc-500">{l.decision}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void call({ action: 'SETTLE', basketId: b.id, approvedPoIds: Array.from(chosen) })
                      }
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                    >
                      {chosen.size === 0
                        ? 'Void the hold (approve nothing)'
                        : `Capture ${usd(chosenCents)} and release ${usd(b.totalCents - chosenCents)}`}
                    </button>
                    {b.status === 'UNKNOWN' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void call({ action: 'RECONCILE', basketId: b.id })}
                        className="rounded-lg bg-purple-600 px-3 py-1.5 font-semibold text-white hover:bg-purple-500"
                      >
                        Reconcile via PayPal GET
                      </button>
                    )}
                  </div>
                </div>
              )}

              {(b.status === 'SETTLED' || b.status === 'VOIDED') && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Captured</span>
                    <span className="font-mono text-emerald-300">{usd(b.capturedCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Released (never charged)</span>
                    <span className="font-mono text-zinc-200">{usd(b.releasedCents)}</span>
                  </div>
                  {b.captureId && <p className="font-mono text-[10px] text-zinc-500">capture id: {b.captureId}</p>}
                  {b.readBack && (
                    <p className={b.readBack.matches ? 'text-emerald-400' : 'text-red-400'}>
                      <ShieldCheck className="mr-1 inline size-3" />
                      {b.readBack.source === 'PAYPAL_GET'
                        ? `Verified with PayPal GET: ${b.readBack.status}`
                        : 'Simulated read-back (not a PayPal confirmation)'}
                    </p>
                  )}
                </div>
              )}
              {b.error && <p className="text-red-300">{b.error}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
