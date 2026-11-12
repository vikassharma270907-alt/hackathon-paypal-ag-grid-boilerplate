'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Layers,
  FileCheck,
  Terminal,
} from 'lucide-react';

export default function JudgesGuidePage() {
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleResetDemo = async () => {
    setResetting(true);
    setResetSuccess(false);
    try {
      const res = await fetch('/api/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESET' }),
      });
      if (res.ok) {
        setResetSuccess(true);
        setTimeout(() => setResetSuccess(false), 3000);
      }
    } catch (e) {
      console.error('Failed to reset demo:', e);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-zinc-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Official Hackathon Judge Console
              </span>
              <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                90-Second Rapid Evaluation Track
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              RestockPilot
              <span className="text-base font-normal text-zinc-400">| Judge Walkthrough & Verification</span>
            </h1>
            <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
              Turn café inventory and sales into an AI-prioritized restock plan, review every quantity within your budget, and approve a PayPal sandbox purchase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleResetDemo}
              disabled={resetting}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
            >
              <RotateCcw className={`size-3.5 ${resetting ? 'animate-spin' : ''}`} />
              {resetSuccess ? 'Demo State Reset!' : 'Reset Demo State'}
            </button>
            <Link
              href="/demo"
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
            >
              Launch Live Demo
              <ArrowRight className="size-3.5" />
            </Link>
            <Link
              href="/red-team"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-700 transition"
            >
              Red-Team Console
              <ArrowRight className="size-3.5" />
            </Link>
            <Link
              href="/verify"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
            >
              Verify a Receipt
              <ArrowRight className="size-3.5" />
            </Link>
            <Link
              href="/evidence"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-700 transition"
            >
              Evidence Registry
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* 1. Two-Sentence Official Positioning */}
        <div className="p-5 rounded-xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-blue-950/40 border border-emerald-800/40">
          <div className="text-xs uppercase tracking-wider font-semibold text-emerald-400 mb-1">
            Core Positioning & Law
          </div>
          <blockquote className="text-base md:text-lg font-medium text-white italic">
            &ldquo;Your café never runs out, and your agent never overspends. AI proposes, deterministic code decides, the owner approves, and PayPal verifies.&rdquo;
          </blockquote>
        </div>

        {/* 2. 60-Second Walkthrough (3 Steps) */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-400" />
            60-Second Rapid Judge Walkthrough
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <span className="size-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs">1</span>
                Trigger Morning Restock
              </div>
              <p className="text-xs text-zinc-300">
                Go to <Link href="/demo" className="text-emerald-400 underline">/demo</Link> and click <strong>[Run Café Restock Cycle (1-Click)]</strong>.
              </p>
              <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800/80 text-[11px] text-zinc-400">
                <strong>Net-Inventory Math:</strong> Oat Milk has 12 on-hand + 12 in-transit = Net Pos 24 &gt; ROP 19.5. RestockPilot orders <strong>0 cases</strong>, saving <strong>$838.50 in duplicate spend</strong>!
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                <span className="size-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs">2</span>
                Filter Peer Median & Policy
              </div>
              <p className="text-xs text-zinc-300">
                Inspect the <strong>ESPRESSO-5LB</strong> Owner Approval Card.
              </p>
              <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800/80 text-[11px] text-zinc-400">
                <strong>Anti-Poisoning Defense:</strong> Pre-filters Channel3 search to <code>sameProduct && inStock</code>. Elevates median from poisoned $49.00 to $63.25, catching a $36.00 counterfeit trap (<strong>ASK</strong>) and picking the $62.00 offer (<strong>ALLOW</strong>).
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm">
                <span className="size-6 rounded-full bg-purple-500/20 flex items-center justify-center text-xs">3</span>
                Two-Phase Idempotent PayPal
              </div>
              <p className="text-xs text-zinc-300">
                Click <strong>[Phase A: Create Order]</strong>, approve in sandbox, then <strong>[Phase B: Capture]</strong>.
              </p>
              <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800/80 text-[11px] text-zinc-400">
                <strong>Two-Phase Safety:</strong> Pre-checks <code>status === &apos;APPROVED&apos;</code> to avoid HTTP 422 errors, writes SHA-256 <code>PayPal-Request-Id</code>, and verifies incoming webhooks with unsigned CRC32.
              </div>
            </div>
          </div>
        </div>

        {/* 3. Three Representative Scenarios */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-400" />
            Three Test Scenarios to Inspect
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-emerald-900/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-200">Case 1: Standard Restock</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  ALLOW
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-2">
                &ldquo;Restock whole-bean espresso beans for the week&rdquo;
              </p>
              <p className="text-[11px] text-zinc-500">
                Passes all 9 rules: active mandate, category allowed, under budget, price ($62.00) matches verified median ($63.25).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/60 border border-amber-900/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-200">Case 2: Suspicious Cheap Trap</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ASK
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-2">
                &ldquo;Liquidation Espresso Beans 5lb at $36.00&rdquo;
              </p>
              <p className="text-[11px] text-zinc-500">
                Trips Rule 8: unit price is &gt;35% below the verified peer median ($63.25). Flags for human confirmation before spend.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-zinc-900/60 border border-rose-900/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-200">Case 3: Budget Breach</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  BLOCK
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-2">
                &ldquo;Commercial Precision Espresso Grinder ($1,850.00)&rdquo;
              </p>
              <p className="text-[11px] text-zinc-500">
                Trips Rule 5: order total ($1,850) exceeds the owner&apos;s $1,200.00 per-order equipment ceiling. Blocked automatically.
              </p>
            </div>
          </div>
        </div>

        {/* 4. Docket Receipt Stamp Legend */}
        <div className="p-5 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-3">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-zinc-300">
            Docket Stamp Status Legend
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="font-mono font-bold text-emerald-400">[PASS / ALLOW]</span>
              <p className="text-[11px] text-zinc-400 mt-1">Passed all 9 policy checks without exceptions.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="font-mono font-bold text-amber-400">[HOLD / ASK]</span>
              <p className="text-[11px] text-zinc-400 mt-1">Requires explicit café owner approval.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="font-mono font-bold text-rose-400">[FAIL / BLOCK]</span>
              <p className="text-[11px] text-zinc-400 mt-1">Violates safety mandate or budget; payment prohibited.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="font-mono font-bold text-blue-400">[CAPTURED]</span>
              <p className="text-[11px] text-zinc-400 mt-1">Settled on PayPal Sandbox with fee deduction.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
              <span className="font-mono font-bold text-purple-400">[WEBHOOK_VERIFIED]</span>
              <p className="text-[11px] text-zinc-400 mt-1">CRC32 + RSA signature verified from PayPal webhook.</p>
            </div>
          </div>
        </div>

        {/* 5. Mapping to the 5 Hackathon Judging Criteria */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileCheck className="size-4 text-emerald-400" />
            Mapping to Official Hackathon Judging Criteria (20% Each)
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-950 text-zinc-400 uppercase font-semibold border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Criterion</th>
                  <th className="py-3 px-4">How RestockPilot Delivers</th>
                  <th className="py-3 px-4">Repository Proof & Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 bg-zinc-900/40">
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">
                    1. Technological Implementation<br />
                    <span className="text-[10px] text-emerald-400 font-normal">Official Hackathon Tie-Breaker</span>
                  </td>
                  <td className="py-3 px-4 text-zinc-300">
                    Two-Phase Orders v2 with pre-capture GET verification, unsigned 32-bit CRC32 raw-body webhook splicing, periodic-review (s, S) replenishment math, unit-price normalizer, grounded and PII-masked AI layer with a daily call cap, Ed25519 publicly verifiable receipts (with a live tamper test on /demo), and read-only MCP server.
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                    <code>src/lib/paypal.ts</code><br />
                    <code>src/lib/units.ts</code><br />
                    <code>src/lib/receipt-ed25519.ts</code><br />
                    <code>src/lib/grounding.ts</code><br />
                    <code>src/app/api/mcp/route.ts</code>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">2. Design</td>
                  <td className="py-3 px-4 text-zinc-300">
                    Bespoke specialty café interface with 1-click execution, live savings badges vs. median and last paid, clear decision cards, and AG Grid reconciliation ledger with status filtering and pinned bottom totals.
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                    <code>src/app/demo/page.tsx</code><br />
                    <code>src/app/evidence/page.tsx</code>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">3. Potential Impact</td>
                  <td className="py-3 px-4 text-zinc-300">
                    Solves cash leaks for independent hospitality businesses: prevents stockouts during morning peak while eliminating duplicate reorders, saving $838.50 per cycle on Oat Milk alone.
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                    <code>src/lib/policy.ts:computeReorder()</code><br />
                    <code>eval/results.md</code>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">4. Innovation / Idea</td>
                  <td className="py-3 px-4 text-zinc-300">
                    B2B Agentic Commerce with human-in-the-loop: Channel3 multi-merchant search combined with an anti-poisoning peer median and a 9-rule non-short-circuiting severity lattice.
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                    <code>src/lib/policy.ts:evaluateMandate()</code><br />
                    <code>src/lib/units.ts</code>
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-white">5. Presentation</td>
                  <td className="py-3 px-4 text-zinc-300">
                    Crisp 2:45 video script, 60-second judge walkthrough, live PayPal Sandbox GET verification buttons, and a 24-case adversarial benchmark.
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                    <code>DEVPOST_SUBMISSION.md</code><br />
                    <code>src/app/judges/page.tsx</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. Sponsor Tools Utilized */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="size-4 text-emerald-400" />
            Sponsor Tools Integration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5">
              <div className="font-semibold text-white text-sm">Channel3 API</div>
              <p className="text-xs text-zinc-400">
                Discovers live B2B supplier listings across 25,000+ merchants for whole-bean coffee, barista oat milk, paper cups, and grinder burrs.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5">
              <div className="font-semibold text-white text-sm">AG Grid Community</div>
              <p className="text-xs text-zinc-400">
                Interactive double-entry ledger with quick-filtering, status pills, SHA-256 idempotency key inspection, and pinned bottom summary row.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-1.5">
              <div className="font-semibold text-white text-sm">PayPal Server SDK & Agent Toolkit</div>
              <p className="text-xs text-zinc-400">
                Two-Phase Orders v2 execution, pre-capture status verification, webhook signature verification, and read-only Model Context Protocol server.
              </p>
            </div>
          </div>
        </div>

        {/* 7. Zero-Friction Sandbox & Simulation Notice */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-start gap-3">
          <Terminal className="size-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-white">Judge Zero-Friction Guarantee</div>
            <p className="text-zinc-400">
              Judges can evaluate every single feature, policy calculation, and ledger reconciliation without setting up API keys or sandbox accounts. The repository ships with transparent, deterministic simulation fallbacks (prefixed <code>SIMULATED_</code>) that execute identically to live sandbox calls.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
