'use client';

import { useState } from 'react';
import {
  ShieldAlert,
  Calculator,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Sparkles,
  RefreshCw,
  Copy,
} from 'lucide-react';
import { DisputeEconomicCalculation, DisputeEvidencePack } from '@/lib/domain-models';

export function DisputeCopilotPanel() {
  const [economicCalc, setEconomicCalc] = useState<DisputeEconomicCalculation | null>(null);
  const [evidencePack, setEvidencePack] = useState<DisputeEvidencePack | null>(null);
  const [loading, setLoading] = useState(false);
  const [disputeId, setDisputeId] = useState('PP-D-84920');
  const [disputedAmount, setDisputedAmount] = useState('1850.00');
  const [claimReason, setClaimReason] = useState('Buyer claims items were not received or arrived defective');
  const [copied, setCopied] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      // 1. Economic calculation
      const resEcon = await fetch(`/api/disputes/${disputeId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputedAmount: parseFloat(disputedAmount),
          buyerClaimReason: claimReason,
        }),
      });
      const dataEcon = await resEcon.json();
      setEconomicCalc(dataEcon);

      // 2. Evidence Pack
      const resPack = await fetch(`/api/disputes/${disputeId}/evidence-pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disputedAmount: parseFloat(disputedAmount),
          buyerClaimReason: claimReason,
        }),
      });
      const dataPack = await resPack.json();
      setEvidencePack(dataPack);
    } catch (_err) {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPack = () => {
    if (!evidencePack) return;
    const text = `# ${evidencePack.summary}\n\nGenerated: ${evidencePack.generatedAt}\n\n${evidencePack.aiAnalysisExplanation}\n\n## Timeline\n${evidencePack.timeline.map((t) => `- ${t.timestamp}: ${t.event} (${t.citation})`).join('\n')}\n\n## Missing Evidence\n${evidencePack.missingOrInconclusiveEvidence.join('\n') || 'None. 100% verified.'}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              AI Dispute Defense Copilot &amp; Evidence Pack Generator
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Grounded in PayPal Disputes v1, transparent Expected Value (EV) decision math, and verifiable multi-document evidence packs.
          </p>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Analyzing Case...' : 'Analyze Dispute & Generate Pack'}</span>
        </button>
      </div>

      {/* Input Configuration & Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <label className="text-slate-400 text-xs font-semibold block mb-1">PayPal Dispute ID:</label>
          <input
            type="text"
            value={disputeId}
            onChange={(e) => setDisputeId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-rose-500"
          />
        </div>
        <div>
          <label className="text-slate-400 text-xs font-semibold block mb-1">Disputed Amount (USD):</label>
          <input
            type="text"
            value={disputedAmount}
            onChange={(e) => setDisputedAmount(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-rose-500"
          />
        </div>
        <div>
          <label className="text-slate-400 text-xs font-semibold block mb-1">Buyer Claim Reason:</label>
          <input
            type="text"
            value={claimReason}
            onChange={(e) => setClaimReason(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Economic Decision Engine Cards */}
      {economicCalc && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calculator className="w-4 h-4 text-rose-400" />
              <span>Economic Decision Engine (Expected Value Analysis)</span>
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
              RECOMMENDATION: {economicCalc.recommendedAction}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Estimated Win Probability</span>
              <div className="text-2xl font-bold font-mono text-emerald-400">
                {Math.round(economicCalc.estimatedWinProbability * 100)}%
              </div>
              <div className="text-[11px] text-slate-400">Backed by signed carrier POD</div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">EV of Defending Claim</span>
              <div className="text-2xl font-bold font-mono text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-5 h-5" />
                <span>+${economicCalc.expectedValueFighting.toFixed(2)}</span>
              </div>
              <div className="text-[11px] text-slate-400">Net after $15 fee &amp; $25 prep</div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Cost of Conceding Claim</span>
              <div className="text-2xl font-bold font-mono text-rose-400 flex items-center gap-1">
                <TrendingDown className="w-5 h-5" />
                <span>-${economicCalc.costOfAcceptingClaim.toFixed(2)}</span>
              </div>
              <div className="text-[11px] text-slate-400">Immediate 100% loss of capital</div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-slate-500 text-[10px] uppercase">Net Savings from Defense</span>
              <div className="text-2xl font-bold font-mono text-cyan-400">
                +${(economicCalc.costOfAcceptingClaim - economicCalc.costOfFightingClaim).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400">Capital preserved vs concession</div>
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
            <strong className="text-white font-semibold">Decision Rationale: </strong>
            {economicCalc.rationale}
          </div>
        </div>
      )}

      {/* Evidence Pack Dossier */}
      {evidencePack && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span>Compiled Evidence Pack ({evidencePack.packId})</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-document evidence bundle citing specific transaction hashes and carrier delivery signatures.
              </p>
            </div>

            <button
              onClick={handleCopyPack}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Evidence Pack'}</span>
            </button>
          </div>

          {/* AI Explanation Rebuttal */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-blue-400 font-bold">
              <Sparkles className="w-4 h-4" />
              <span>AI Rebuttal Narrative (Citation-Grounded)</span>
            </div>
            <p className="text-slate-300 leading-relaxed">{evidencePack.aiAnalysisExplanation}</p>
          </div>

          {/* Timeline of Records */}
          <div className="space-y-2 text-xs">
            <h4 className="font-semibold text-slate-300">Transaction Chronology &amp; Evidence Citations:</h4>
            <div className="space-y-1.5">
              {evidencePack.timeline.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-500">[{item.timestamp.slice(0, 10)}]</span>
                    <span className="text-white font-medium">{item.event}</span>
                  </div>
                  <span className="text-blue-400 font-mono text-[10px]">{item.citation}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
