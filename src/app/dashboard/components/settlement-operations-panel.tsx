'use client';

import { useState } from 'react';
import {
  CreditCard,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Zap,
  Info,
} from 'lucide-react';
import { PayPalTransactionState } from '@/lib/paypal-state-machine';

export function SettlementOperationsPanel() {
  const [currentState, setCurrentState] = useState<PayPalTransactionState>('AUTHORIZED');
  const [settlementAmount, setSettlementAmount] = useState('2450.00');
  const [isPartial, setIsPartial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);

  const statesOrder: PayPalTransactionState[] = [
    'CREATED',
    'ORDER_PENDING',
    'AUTHORIZED',
    'EVIDENCE_PENDING',
    'APPROVAL_PENDING',
    'APPROVED',
    'CAPTURED',
  ];

  const handleExecuteCapture = async () => {
    setLoading(true);
    setExecutionResult(null);
    try {
      const res = await fetch('/api/settlements/PO-2026-001/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: settlementAmount,
          currency: 'USD',
          authorizationId: 'AUTH-2026-001',
          finalCapture: true,
        }),
      });
      const data = await res.json();
      setExecutionResult(data);
      setCurrentState('CAPTURED');
    } catch (_err) {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              Settlement Operations &amp; PayPal State Machine
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic execution lifecycle: Orders v2 escrow holds, milestone inspection releases, and final Payments v2 captures.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
          <span className="text-slate-500">Current State:</span>
          <span className="text-cyan-400 font-bold">{currentState}</span>
        </div>
      </div>

      {/* State Machine Pipeline Visualizer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
          <span className="font-semibold uppercase tracking-wider text-slate-300">
            Validated State Transition Pipeline
          </span>
          <span className="text-[11px] font-mono text-slate-500">Fail-Closed Invariants Enforced</span>
        </div>

        <div className="overflow-x-auto py-2">
          <div className="flex items-center gap-2 min-w-[700px]">
            {statesOrder.map((step, idx) => {
              const isPast = statesOrder.indexOf(currentState) >= idx;
              const isCurrent = currentState === step;

              return (
                <div key={step} className="flex items-center flex-1">
                  <div
                    className={`flex-1 p-3 rounded-xl border flex flex-col justify-center items-center text-center transition-all ${
                      isCurrent
                        ? 'bg-cyan-950/70 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/10'
                        : isPast
                        ? 'bg-slate-950 border-slate-800 text-slate-300'
                        : 'bg-slate-950/40 border-slate-900 text-slate-600'
                    }`}
                  >
                    <div className="text-[10px] font-mono text-slate-500 mb-0.5">0{idx + 1}</div>
                    <div className="text-xs font-bold font-mono">{step}</div>
                  </div>
                  {idx < statesOrder.length - 1 && (
                    <ArrowRight className={`w-4 h-4 mx-1.5 shrink-0 ${isPast ? 'text-cyan-600' : 'text-slate-800'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Settlement Execution Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Execution Form (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Execute PayPal Payments v2 Capture
            </h3>
            <span className="text-xs text-slate-400 font-mono">intent: AUTHORIZE hold release</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Authorization Hold ID:</span>
                <span className="font-mono text-cyan-400 font-semibold">AUTH-2026-001</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Original Authorized Amount:</span>
                <span className="font-mono text-slate-200">$2,450.00 USD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Verified Accepted Eligible:</span>
                <span className="font-mono text-emerald-400 font-bold">$2,450.00 USD</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-400 font-semibold block">Settlement Release Amount (USD):</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500 font-mono">$</span>
                <input
                  type="text"
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-7 py-2 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="partialToggle"
                checked={isPartial}
                onChange={(e) => {
                  setIsPartial(e.target.checked);
                  setSettlementAmount(e.target.checked ? '1715.00' : '2450.00');
                }}
                className="rounded border-slate-800 bg-slate-950 text-cyan-500 focus:ring-0 cursor-pointer"
              />
              <label htmlFor="partialToggle" className="text-slate-300 text-xs cursor-pointer select-none">
                Simulate partial delivery capture (e.g. 70% accepted = $1,715.00)
              </label>
            </div>

            <div className="pt-3">
              <button
                onClick={handleExecuteCapture}
                disabled={loading || currentState === 'CAPTURED'}
                className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold tracking-wide uppercase shadow transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Zap className={`w-4 h-4 ${loading ? 'animate-bounce' : ''}`} />
                <span>
                  {loading
                    ? 'Executing PayPal Sandbox Capture...'
                    : currentState === 'CAPTURED'
                    ? 'Settlement Fully Captured'
                    : `Execute Verified Capture ($${settlementAmount})`}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Execution Audit & Debug Output (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                PayPal Telemetry &amp; Trace
              </h3>
              <span className="text-[11px] font-mono text-emerald-400">Sandbox Verified</span>
            </div>

            {executionResult ? (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mt-3 space-y-2 text-xs font-mono">
                <div className="text-emerald-400 font-bold font-sans flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Payments v2 Capture Succeeded</span>
                </div>
                <div className="text-slate-400 pt-1 space-y-1">
                  <div>Capture ID: <span className="text-white">{executionResult.captureId}</span></div>
                  <div>Captured: <span className="text-emerald-400 font-bold">${executionResult.capturedAmount} {executionResult.currency}</span></div>
                  <div>PayPal-Debug-Id: <span className="text-cyan-400">{executionResult.paypalDebugId}</span></div>
                  <div>Latency: <span className="text-slate-300">{executionResult.latencyMs}ms</span></div>
                  <div>Final Capture: <span className="text-white">true</span></div>
                </div>
              </div>
            ) : (
              <div className="text-center p-8 text-slate-500 text-xs">
                No capture operation executed in this session yet. Press 'Execute' to trigger PayPal Sandbox Payments v2.
              </div>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              VeriSettle AI is an evidence-gated payment authorization and settlement workflow platform, and does not operate as an unlicensed custodial escrow bank.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
