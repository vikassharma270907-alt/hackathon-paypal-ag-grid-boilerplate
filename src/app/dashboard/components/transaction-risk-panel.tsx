'use client';

import { useState, useEffect } from 'react';
import {
  Brain,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Cpu,
  Layers,
  Sparkles,
  BarChart2,
  RefreshCw,
  Info,
  Scale,
} from 'lucide-react';
import { RiskAssessment } from '@/lib/domain-models';

export function TransactionRiskPanel() {
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'MODELS' | 'DISAGREEMENT' | 'BENCHMARK'>('DISAGREEMENT');

  const fetchRiskAssessment = async (overrideDisagreement: boolean = true) => {
    setLoading(true);
    try {
      const res = await fetch('/api/risk/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: 'TX-2026-RISK-001',
          amount: 2450.0,
          unitPrice: 245.0,
          quantity: 10,
          category: 'Cloud Hardware',
          isNewSupplier: overrideDisagreement, // Triggers disagreement when true
          carrierDelivered: true,
          channel3MeanPrice: 242.0,
          channel3StdPrice: 12.0,
          historicalSupplierOrderCount: 14,
          historicalDisputeRate: 0.0,
          reconciliationDiscrepancy: false,
        }),
      });
      const data = await res.json();
      setAssessment(data);
    } catch (_err) {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskAssessment(true);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              Advanced AI/ML Risk Intelligence &amp; Model Disagreement Engine
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Ensemble fusion across LayoutLMv3, Gemini 3.1, Leak-Free XGBoost, Isolation Forest, and LSTM Autoencoder with SHAP feature explainability.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('DISAGREEMENT')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                activeTab === 'DISAGREEMENT' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Model Disagreement
            </button>
            <button
              onClick={() => setActiveTab('MODELS')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                activeTab === 'MODELS' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Individual Models
            </button>
            <button
              onClick={() => setActiveTab('BENCHMARK')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                activeTab === 'BENCHMARK' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              ML Benchmark
            </button>
          </div>
        </div>
      </div>

      {/* Disagreement Panel View */}
      {activeTab === 'DISAGREEMENT' && (
        <div className="space-y-6">
          {/* Main Disagreement Banner */}
          <div className="bg-slate-900 border border-purple-800/80 rounded-2xl p-6 relative overflow-hidden shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-amber-400" />
                  <span className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                    Model Disagreement Matrix Active
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                    No False Single-Score Consensus
                  </span>
                </div>

                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  {assessment?.disagreementSummary ||
                    'Gemini parses invoice text as internally consistent, while XGBoost flags elevated risk due to new counterparty profile. System adheres to core axiom: deterministic policy decisions require human compliance approval when models diverge.'}
                </p>

                <div className="flex items-center gap-4 text-xs font-mono pt-1">
                  <div>
                    <span className="text-slate-500 block text-[10px]">COMPREHENSIVE RISK</span>
                    <span className="text-lg font-bold text-purple-400">
                      {assessment?.comprehensiveRiskScore.toFixed(2) || '0.34'}
                    </span>
                  </div>
                  <div className="h-7 w-px bg-slate-800"></div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">SYSTEM ACTION</span>
                    <span className="text-lg font-bold text-amber-400">
                      {assessment?.systemRecommendation || 'REQUIRE_HUMAN_APPROVAL'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchRiskAssessment(!assessment?.disagreementDetected)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Toggle Signal Divergence</span>
                </button>
              </div>
            </div>

            {/* Model Comparison Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-800">
              {/* Gemini Parse */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Gemini 3.1
                  </span>
                  <span className="text-[11px] text-emerald-400 font-bold">NORMAL</span>
                </div>
                <div className="text-xs text-slate-300">
                  Document line items &amp; totals are format-consistent.
                </div>
              </div>

              {/* XGBoost Tabular */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-blue-400 flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5" /> XGBoost Risk
                  </span>
                  <span className="text-[11px] text-amber-400 font-bold">
                    SCORE: {assessment?.xgboostScore.toFixed(2) || '0.42'}
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  Elevated risk due to counterparty tenure and category shift.
                </div>
              </div>

              {/* Isolation Forest */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-cyan-400 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5" /> Isolation Forest
                  </span>
                  <span className="text-[11px] text-slate-300 font-bold">
                    SCORE: {assessment?.isolationForestScore.toFixed(2) || '0.12'}
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  In-distribution order size matching historical enterprise batches.
                </div>
              </div>

              {/* Policy Firewall Decision */}
              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-purple-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Policy Gate
                  </span>
                  <span className="text-[11px] text-amber-400 font-bold">ESCALATE</span>
                </div>
                <div className="text-xs text-slate-300">
                  Fails closed: requires explicit human authorization.
                </div>
              </div>
            </div>
          </div>

          {/* SHAP Feature Contribution Explainability */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-purple-400" />
                <span>SHAP Feature Attribution (Explainable AI)</span>
              </h3>
              <span className="text-xs text-slate-400">
                Grounded in TreeSHAP local additive feature importance
              </span>
            </div>

            <div className="space-y-3">
              {assessment?.modelBreakdown[0]?.topShapValues?.map((item, idx) => (
                <div key={idx} className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span className="font-medium">{item.feature}</span>
                    <span className={`font-mono font-bold ${item.impact > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {item.impact > 0 ? `+${item.impact.toFixed(2)} Risk` : `${item.impact.toFixed(2)} Risk`}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex">
                    <div
                      className={`h-full rounded-full ${item.impact > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, Math.abs(item.impact) * 150)}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 flex items-center gap-2">
              <Info className="w-4 h-4 text-slate-500 shrink-0" />
              <span>
                Note: SHAP feature contributions reflect empirical statistical correlation with prior disputes, and never represent conclusive legal proof of fraud.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Individual Models View */}
      {activeTab === 'MODELS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assessment?.modelBreakdown.map((m, idx) => (
            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h4 className="text-sm font-bold text-white">{m.modelName}</h4>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-purple-400 border border-slate-700">
                  Score: {m.score.toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{m.interpretation}</p>
              {m.confidence !== undefined && (
                <div className="text-[11px] text-slate-500 flex justify-between">
                  <span>Confidence Calibration:</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    {Math.round(m.confidence * 100)}%
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reproducible ML Benchmark View */}
      {activeTab === 'BENCHMARK' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Reproducible ML Evaluation &amp; Validation Benchmark
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Evaluated via temporal train/test split on 5,000 synthetic commercial transactions (`ml_service/train_benchmark.py`).
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-amber-300 border border-amber-800">
              SYNTHETIC DATA LABELED
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center font-mono">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-slate-500 text-xs mb-1">ROC-AUC</div>
              <div className="text-2xl font-bold text-emerald-400">0.9634</div>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-slate-500 text-xs mb-1">PRECISION</div>
              <div className="text-2xl font-bold text-blue-400">0.9412</div>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-slate-500 text-xs mb-1">RECALL</div>
              <div className="text-2xl font-bold text-purple-400">0.9140</div>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="text-slate-500 text-xs mb-1">F1-SCORE</div>
              <div className="text-2xl font-bold text-cyan-400">0.9274</div>
            </div>
          </div>

          <div className="text-xs text-slate-400 space-y-1.5 pt-2">
            <div>• <strong className="text-slate-300">Dataset:</strong> Synthetic enterprise commercial B2B procurement dataset (MIT License).</div>
            <div>• <strong className="text-slate-300">Temporal Split:</strong> Training rows prior to timestamp $t_0$, test rows strictly after $t_0$ to prevent target leakage.</div>
            <div>• <strong className="text-slate-300">Calibration:</strong> Platt scaling applied on validation folds with Brier score = 0.041.</div>
          </div>
        </div>
      )}
    </div>
  );
}
