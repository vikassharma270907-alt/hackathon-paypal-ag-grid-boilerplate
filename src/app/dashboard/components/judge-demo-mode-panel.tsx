'use client';

import { useState } from 'react';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  DollarSign,
  FileText,
  Clock,
  ArrowRight,
  Sparkles,
  Download,
} from 'lucide-react';
import { DemoScenarioExecutionResult } from '@/lib/demo-engine';

export function JudgeDemoModePanel() {
  const [activeScenario, setActiveScenario] = useState<'CLEAN' | 'TAMPERED' | 'PARTIAL'>('CLEAN');
  const [executing, setExecuting] = useState(false);
  const [demoResult, setDemoResult] = useState<DemoScenarioExecutionResult | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const runScenario = async (scenarioId: 'CLEAN' | 'TAMPERED' | 'PARTIAL') => {
    setActiveScenario(scenarioId);
    setExecuting(true);
    setDemoResult(null);
    setResetMessage(null);

    try {
      const res = await fetch(`/api/demo/${scenarioId.toLowerCase()}/run`, {
        method: 'POST',
      });
      const data = await res.json();
      setDemoResult(data);
    } catch (_err) {
      // Handle error
    } finally {
      setExecuting(false);
    }
  };

  const handleReset = async () => {
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      const data = await res.json();
      setDemoResult(null);
      setResetMessage(data.message);
      setTimeout(() => setResetMessage(null), 4000);
    } catch (_err) {
      // Handle error
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'BLOCKED':
        return <XCircle className="w-4 h-4 text-rose-400" />;
      case 'FLAGGED':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default:
        return <Clock className="w-4 h-4 text-blue-400 animate-spin" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Prominent Header with RUN VERISETTLE LIVE DEMO */}
      <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/40 to-slate-900 border border-blue-500/40 p-6 rounded-2xl relative overflow-hidden shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white font-extrabold px-3 py-1 rounded-lg text-xs tracking-wider uppercase shadow">
                Judge Demo Mode
              </span>
              <span className="text-xs font-mono text-slate-400">1-Click Live Demonstration</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-wide">
              RUN VERISETTLE LIVE DEMO
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Experience the full autonomous financial operations lifecycle across 3 distinct real-world scenarios. Validates multimodal AI, deterministic 4-way matching, cryptographic policy mandates, and live PayPal Sandbox Orders v2 &amp; Payments v2 execution.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => runScenario(activeScenario)}
              disabled={executing}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold tracking-wide uppercase shadow-lg shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-2"
            >
              <Play className={`w-4 h-4 ${executing ? 'animate-spin' : 'fill-current'}`} />
              <span>{executing ? 'Executing Pipeline...' : `Run ${activeScenario} Scenario`}</span>
            </button>

            <button
              onClick={handleReset}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset State</span>
            </button>
          </div>
        </div>

        {resetMessage && (
          <div className="mt-4 p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-xs text-emerald-300">
            {resetMessage}
          </div>
        )}
      </div>

      {/* 3 Repeatable Scenario Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Scenario A: Clean Transaction */}
        <div
          onClick={() => runScenario('CLEAN')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
            activeScenario === 'CLEAN'
              ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-500/10'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-bold text-emerald-400 uppercase tracking-wider">Scenario A</span>
              <span className="text-[11px] font-mono text-slate-500">100% Match</span>
            </div>
            <h3 className="text-base font-bold text-white">Clean Commercial Transaction</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Valid Purchase Order ($2,450.00), matching invoice, full carrier delivery verified (10/10 units). Fully authorized and captured via PayPal Sandbox.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] font-semibold text-emerald-400 flex items-center justify-between">
            <span>Result: Capture Permitted</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Scenario B: Tampered Invoice */}
        <div
          onClick={() => runScenario('TAMPERED')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
            activeScenario === 'TAMPERED'
              ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-500/10'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-bold text-rose-400 uppercase tracking-wider">Scenario B</span>
              <span className="text-[11px] font-mono text-rose-400">+5.0% Variance</span>
            </div>
            <h3 className="text-base font-bold text-white">Tampered Supplier Invoice</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Supplier inflates invoice by +5% ($2,572.50). 4-Way Match flags variance, Deterministic Policy Firewall immediately freezes payment. Zero money movement.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] font-semibold text-rose-400 flex items-center justify-between">
            <span>Result: Frozen (Fail-Closed)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Scenario C: Partial Delivery */}
        <div
          onClick={() => runScenario('PARTIAL')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
            activeScenario === 'PARTIAL'
              ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-500/10'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-bold text-cyan-400 uppercase tracking-wider">Scenario C</span>
              <span className="text-[11px] font-mono text-cyan-400">70% Delivered</span>
            </div>
            <h3 className="text-base font-bold text-white">Partial Delivery Clamping</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Order for 100 units billed at $2,450.00. Carrier dock inspection verifies only 70 units accepted. Policy clamps capture to $1,715.00 via PayPal Sandbox partial capture.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] font-semibold text-cyan-400 flex items-center justify-between">
            <span>Result: Clamped Partial Capture</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Execution Trace Output */}
      {demoResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-white">{demoResult.scenarioTitle}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Outcome: <strong className="text-white">{demoResult.overallStatus}</strong> • Eligible: <strong className="text-emerald-400 font-mono">${demoResult.eligibleSettlementAmount.toFixed(2)}</strong> • Overpayment Prevented: <strong className="text-amber-400 font-mono">${demoResult.preventedOverpaymentAmount.toFixed(2)}</strong>
              </p>
            </div>

            {demoResult.paypalOrderId && (
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-400">
                <div>PayPal Order: <span className="text-white font-semibold">{demoResult.paypalOrderId}</span></div>
                {demoResult.paypalDebugId && (
                  <div>Debug-Id: <span className="text-cyan-400">{demoResult.paypalDebugId}</span></div>
                )}
              </div>
            )}
          </div>

          {/* End-to-End Pipeline Trace Steps */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Autonomous Pipeline Execution Trace:
            </h4>
            <div className="space-y-2">
              {demoResult.trace.map((step, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="mt-0.5 sm:mt-0">{getStatusIcon(step.status)}</div>
                    <div>
                      <div className="font-semibold text-white flex items-center gap-2">
                        <span>{step.stage}: {step.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          step.status === 'COMPLETED' ? 'bg-emerald-950 text-emerald-400' :
                          step.status === 'BLOCKED' ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'
                        }`}>
                          {step.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{step.detail}</div>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-slate-500 shrink-0">
                    {step.durationMs}ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
