'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BadgeCheck, FileSignature, ShieldX, TriangleAlert } from 'lucide-react';
import { verifyReceiptInBrowser, type BrowserReceipt, type BrowserVerifyResult } from '@/lib/receipt-browser-verify';

export default function VerifyReceiptPage() {
  const [publicKey, setPublicKey] = useState('');
  const [receiptText, setReceiptText] = useState('');
  const [result, setResult] = useState<BrowserVerifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/receipt')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && typeof d.publicKeyPem === 'string') setPublicKey(d.publicKeyPem);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadSample() {
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const res = await fetch('/api/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SAMPLE' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Could not load sample');
      setReceiptText(JSON.stringify(d.receipt, null, 2));
      setPublicKey(d.publicKeyPem);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load sample');
    } finally {
      setBusy(false);
    }
  }

  function tamper() {
    setResult(null);
    try {
      const r = JSON.parse(receiptText) as BrowserReceipt;
      const p = r.payload as Record<string, unknown>;
      if (typeof p.totalPrice === 'number') p.totalPrice = 1;
      else p.tampered = true;
      setReceiptText(JSON.stringify(r, null, 2));
      setMessage('Changed the total to $1. Now verify it.');
    } catch {
      setMessage('Load a sample receipt first.');
    }
  }

  async function verify() {
    setMessage(null);
    let receipt: BrowserReceipt;
    try {
      receipt = JSON.parse(receiptText) as BrowserReceipt;
    } catch {
      setResult({ status: 'invalid', reason: 'That is not valid JSON.' });
      return;
    }
    setResult(await verifyReceiptInBrowser(receipt, publicKey));
  }

  const area =
    'w-full rounded-md bg-zinc-950 border border-zinc-700 p-3 text-[11px] font-mono text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="min-h-screen bg-[#0B0F17] text-zinc-100 p-4 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="pb-5 border-b border-zinc-800">
          <Link href="/judges" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 mb-2">
            <ArrowLeft className="size-3.5" aria-hidden /> Judge console
          </Link>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <FileSignature className="size-7 text-emerald-400" aria-hidden /> Verify a Receipt Yourself
          </h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
            Every approved restock gets an Ed25519-signed receipt. This page checks the signature inside your browser
            with WebCrypto. Your receipt is not sent to our server, and you only need the public key.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label htmlFor="v-receipt" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Receipt JSON
            </label>
            <textarea
              id="v-receipt"
              rows={18}
              value={receiptText}
              onChange={(e) => {
                setReceiptText(e.target.value);
                setResult(null);
              }}
              placeholder="Paste a receipt, or load a sample"
              className={area}
              spellCheck={false}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={loadSample} disabled={busy} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                1. Load sample receipt
              </button>
              <button type="button" onClick={tamper} disabled={!receiptText} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-200 border border-amber-700/50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400">
                2. Tamper with it
              </button>
              <button type="button" onClick={verify} disabled={!receiptText || !publicKey} className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-300">
                3. Verify in browser
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="v-key" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Public key (PEM)
            </label>
            <textarea id="v-key" rows={6} value={publicKey} onChange={(e) => { setPublicKey(e.target.value); setResult(null); }} className={area} spellCheck={false} />

            <div aria-live="polite" className="min-h-24">
              {result?.status === 'valid' && (
                <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-700/50 flex gap-3">
                  <BadgeCheck className="size-6 text-emerald-400 shrink-0" aria-hidden />
                  <div>
                    <div className="font-semibold text-emerald-300">Signature valid</div>
                    <p className="text-xs text-zinc-400">The contents match what the server signed. Nothing was changed after approval.</p>
                  </div>
                </div>
              )}
              {result?.status === 'invalid' && (
                <div role="alert" className="p-4 rounded-xl bg-rose-950/40 border border-rose-700/50 flex gap-3">
                  <ShieldX className="size-6 text-rose-400 shrink-0" aria-hidden />
                  <div>
                    <div className="font-semibold text-rose-300">Tampering detected</div>
                    <p className="text-xs text-zinc-400">{result.reason}</p>
                  </div>
                </div>
              )}
              {result?.status === 'unsupported' && (
                <div role="alert" className="p-4 rounded-xl bg-amber-950/40 border border-amber-700/50 flex gap-3">
                  <TriangleAlert className="size-6 text-amber-400 shrink-0" aria-hidden />
                  <div>
                    <div className="font-semibold text-amber-300">Cannot verify here</div>
                    <p className="text-xs text-zinc-400">{result.reason}</p>
                  </div>
                </div>
              )}
              {message && <p className="text-xs text-zinc-400 mt-2">{message}</p>}
            </div>

            <div className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
              <p><strong className="text-zinc-300">What is signed:</strong> the canonical (sorted-key) JSON of the docket plus the signing timestamp: PO id, SKU, merchant, quantity, prices, policy decision, contract hash, and PayPal order and capture ids.</p>
              <p><strong className="text-zinc-300">Honest limit:</strong> unless <code>RECEIPT_SIGNING_SECRET</code> is set on the server, the key is derived from a public fallback and receipts are forgeable by anyone with the repo. Fine for a sandbox demo, not for production.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
