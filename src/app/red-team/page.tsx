'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bug, CheckCircle2, ShieldAlert, ShieldCheck, Skull, Swords, XCircle } from 'lucide-react';
import { RED_TEAM_PRESETS, type RedTeamInput, type RedTeamResult } from '@/lib/redteam';

const SKUS = ['ESPRESSO-5LB', 'OAT-MILK-6PK', 'CUPS-12OZ-500', 'BURR-GRINDER-SET', 'LOUNGE-CHAIR'];
const CONDITIONS: RedTeamInput['condition'][] = ['new', 'refurbished', 'open_box', 'used'];

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const decisionStyle = {
  ALLOW: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  ASK: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  BLOCK: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
} as const;

const fixLabel = { AGENT: 'Agent can fix', OWNER: 'Owner decision', NONE: 'Pick another offer' } as const;

export default function RedTeamPage() {
  const [form, setForm] = useState<RedTeamInput>(RED_TEAM_PRESETS[1].input);
  const [activePreset, setActivePreset] = useState<string | null>(RED_TEAM_PRESETS[1].id);
  const [result, setResult] = useState<RedTeamResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (input: RedTeamInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/red-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setResult(data as RedTeamResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial run of the default attack so the page is never empty.
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/red-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(RED_TEAM_PRESETS[1].input),
      });
      if (!cancelled && res.ok) setResult((await res.json()) as RedTeamResult);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const pickPreset = (id: string) => {
    const p = RED_TEAM_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setForm(p.input);
    setActivePreset(id);
    void run(p.input);
  };

  const set = <K extends keyof RedTeamInput>(key: K, value: RedTeamInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setActivePreset(null);
  };

  const rp = result?.restockPilot;
  const inputCls =
    'w-full rounded-md bg-zinc-950 border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500';
  const labelCls = 'block text-[11px] font-medium text-zinc-400 mb-1';

  return (
    <div className="min-h-screen bg-[#0B0F17] text-zinc-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-5 border-b border-zinc-800">
          <div>
            <Link href="/judges" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 mb-2">
              <ArrowLeft className="size-3.5" aria-hidden /> Judge console
            </Link>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Swords className="size-7 text-rose-400" aria-hidden /> Red-Team Console
            </h1>
            <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
              You are the malicious merchant. Write any listing you like, then watch the same policy code that guards the
              real restock flow decide. Nothing here touches PayPal, the live demo state, or a model.
            </p>
          </div>
          <div className="text-[11px] text-zinc-500 max-w-xs">
            Catalog-match flags are set by hand here. In production Channel3 matching sets them and{' '}
            <code>computeReorder()</code> sets quantity. Listing text never does.
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: attack builder */}
          <section className="lg:col-span-2 space-y-4" aria-label="Attack builder">
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Pick an attack</h2>
              <div className="grid grid-cols-1 gap-2">
                {RED_TEAM_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickPreset(p.id)}
                    aria-pressed={activePreset === p.id}
                    className={`text-left p-3 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      activePreset === p.id
                        ? 'bg-zinc-800 border-emerald-500/60'
                        : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="text-xs font-semibold text-zinc-100">{p.label}</div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">{p.blurb}</div>
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(form);
              }}
              className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Craft your own</h2>
              <div>
                <label htmlFor="rt-title" className={labelCls}>Listing title (attacker controlled)</label>
                <textarea
                  id="rt-title"
                  rows={2}
                  maxLength={600}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="rt-desc" className={labelCls}>Description (attacker controlled)</label>
                <textarea
                  id="rt-desc"
                  rows={2}
                  maxLength={600}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rt-merchant" className={labelCls}>Merchant</label>
                  <input id="rt-merchant" value={form.merchantName} maxLength={120} onChange={(e) => set('merchantName', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="rt-sku" className={labelCls}>Target SKU</label>
                  <select id="rt-sku" value={form.sku} onChange={(e) => set('sku', e.target.value)} className={inputCls}>
                    {SKUS.map((s) => (<option key={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label htmlFor="rt-cat" className={labelCls}>Category</label>
                  <input id="rt-cat" value={form.category} maxLength={80} onChange={(e) => set('category', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="rt-cond" className={labelCls}>Condition</label>
                  <select id="rt-cond" value={form.condition} onChange={(e) => set('condition', e.target.value as RedTeamInput['condition'])} className={inputCls}>
                    {CONDITIONS.map((c) => (<option key={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label htmlFor="rt-price" className={labelCls}>Unit price (USD)</label>
                  <input id="rt-price" type="number" min={0.01} step="0.01" value={form.unitPrice} onChange={(e) => set('unitPrice', Number(e.target.value))} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="rt-qty" className={labelCls}>Qty from replenishment math</label>
                  <input id="rt-qty" type="number" min={1} step="1" value={form.qty} onChange={(e) => set('qty', Number(e.target.value))} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label htmlFor="rt-spend" className={labelCls}>Month-to-date spend already committed (budget is $4,000)</label>
                  <input id="rt-spend" type="number" min={0} step="1" value={form.spendSoFar} onChange={(e) => set('spendSoFar', Number(e.target.value))} className={inputCls} />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-zinc-300">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.inStock} onChange={(e) => set('inStock', e.target.checked)} /> In stock
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.sameProduct} onChange={(e) => set('sameProduct', e.target.checked)} /> Matches target product and pack
                </label>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-60 text-white text-sm font-semibold py-2 transition focus:outline-none focus:ring-2 focus:ring-rose-300"
              >
                <Bug className="size-4" aria-hidden /> {loading ? 'Attacking…' : 'Launch attack'}
              </button>
              {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
            </form>
          </section>

          {/* RIGHT: results */}
          <section className="lg:col-span-3 space-y-4" aria-label="Results" aria-live="polite">
            {!result || !rp ? (
              <div className="p-10 rounded-xl border border-dashed border-zinc-800 text-center text-sm text-zinc-500">
                Loading first attack…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-rose-900/50 bg-rose-950/20 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
                      <Skull className="size-4" aria-hidden /> Naive agent (obeys the listing)
                    </div>
                    <div className="text-2xl font-bold text-rose-200">{usd(result.naive.spend)}</div>
                    <div className="text-[11px] text-zinc-400">
                      Orders {result.naive.qty} units. {result.naive.explanation}
                    </div>
                  </div>
                  <div className={`p-4 rounded-xl border space-y-2 ${decisionStyle[rp.decision]}`}>
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      {rp.decision === 'ALLOW' ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldAlert className="size-4" aria-hidden />}
                      RestockPilot verdict
                    </div>
                    <div className="text-2xl font-bold">{rp.decision}</div>
                    <div className="text-[11px] opacity-80">
                      {rp.qty} units, {usd(rp.total)}. {rp.decision === 'ALLOW' ? 'Auto-approved by policy.' : rp.decision === 'ASK' ? 'Waits for the owner. No money moves.' : 'Payment prohibited.'}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 text-xs text-zinc-300">
                  Unsafe spend avoided versus the naive agent:{' '}
                  <strong className="text-emerald-300">{usd(result.unsafeSpendAvoided)}</strong>
                  <span className="text-zinc-500"> · quantity source: {rp.quantitySource}</span>
                </div>

                {/* Sanitization */}
                <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                    Layer 1: what the model would see
                    <span className={`px-2 py-0.5 rounded-full text-[10px] border ${result.sanitized.flagged ? 'border-amber-500/40 text-amber-300 bg-amber-500/10' : 'border-zinc-700 text-zinc-400'}`}>
                      {result.sanitized.flagged ? `${result.sanitized.matches} instruction(s) removed` : 'clean'}
                    </span>
                  </h3>
                  <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words rounded-md bg-zinc-950 border border-zinc-800 p-3 text-zinc-300">{result.sanitized.fencedPrompt}</pre>
                  <p className="text-[11px] text-zinc-500">
                    Defence in depth only. Even if this text fooled a model, the model holds no money tools and the gate below decides.
                  </p>
                </div>

                {/* Rules */}
                <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Layer 2: 9-rule severity lattice (all rules always run, BLOCK &gt; ASK &gt; ALLOW)
                  </h3>
                  <ul className="space-y-1.5 text-xs">
                    {rp.policy.blockReasons.map((r) => (
                      <li key={r} className="flex gap-2 text-rose-300"><XCircle className="size-4 shrink-0" aria-label="Blocked" />{r}</li>
                    ))}
                    {rp.policy.askReasons.map((r) => (
                      <li key={r} className="flex gap-2 text-amber-300"><ShieldAlert className="size-4 shrink-0" aria-label="Needs owner" />{r}</li>
                    ))}
                    {rp.policy.rulesPassed.map((r) => (
                      <li key={r} className="flex gap-2 text-zinc-400"><CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Passed" />{r}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-zinc-500">
                    Verified peer median used for Rule 8: {rp.verifiedMedianPrice > 0 ? usd(rp.verifiedMedianPrice) : 'none available'}.
                  </p>
                </div>

                {/* Counterfactual */}
                {result.counterfactual.items.length > 0 && (
                  <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Layer 3: what would change this decision?
                    </h3>
                    <ul className="space-y-2">
                      {result.counterfactual.items.map((c) => (
                        <li key={c.rule + c.suggestion} className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${decisionStyle[c.severity]}`}>{c.severity}</span>
                            <span className="font-semibold text-zinc-200">{c.rule}</span>
                            <span className="text-[10px] text-zinc-500">{fixLabel[c.fixableBy]}</span>
                          </div>
                          <p className="text-zinc-400 mt-0.5 ml-1">{c.suggestion}</p>
                        </li>
                      ))}
                    </ul>
                    {result.counterfactual.verifiedAlternative && (
                      <div className="p-2.5 rounded-md bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-200">
                        Proven alternative: {result.counterfactual.verifiedAlternative.note}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
