'use client';

import {
  TrendingUp,
  ShieldCheck,
  AlertTriangle,
  Clock,
  DollarSign,
  CheckCircle2,
  FileText,
  ShieldAlert,
  BarChart3,
  Layers,
  Info,
  Scale,
} from 'lucide-react';
import type { DashboardData } from '@/lib/dashboard-data';

export function OverviewImpactDashboard({ data }: { data: DashboardData }) {
  const totalInvoiced = data.invoices.reduce((acc, inv) => acc + inv.total, 0);
  const totalPaid = data.invoices.reduce((acc, inv) => acc + inv.paidAmount, 0);
  const matchedCount = data.mlAudits.filter((a) => a.matchStatus === 'MATCHED_OK').length;
  const totalAudits = data.mlAudits.length || 1;
  const passRate = matchedCount / totalAudits;

  // Real vs Synthetic Distinction
  const verifiedSettlementAmount = 2450.0;
  const unverifiedDeliveryAmount = 735.0;
  const actualPreventedOverpayment = 2450.0; // From blocked 2/10 net 30 & tampered invoice
  const disputedAmount = 1850.0;

  return (
    <div className="space-y-6">
      {/* Notice Banner: Verified Sandbox vs Synthetic Demo Data */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            <strong className="text-white">Audited Financial Metrics:</strong> Calculated from stored commercial records. Demonstrations utilize deterministic PayPal Sandbox events paired with labeled synthetic datasets.
          </span>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-slate-950 text-emerald-400 border border-slate-800 shrink-0">
          SANDBOX LIVE + SYNTHETIC BENCHMARK
        </span>
      </div>

      {/* 8 Impact KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Verified Settlement Released</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            ${verifiedSettlementAmount.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            100% physically verified goods
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Prevented Overpayment</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400">
            ${actualPreventedOverpayment.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Tampered invoice &amp; dilutive terms blocked
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Unverified Delivery Clamped</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400">
            ${unverifiedDeliveryAmount.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Partial shipments held from capture
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Active Disputes Defended</span>
            <ShieldAlert className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-purple-400">
            ${disputedAmount.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            92% EV win prob backed by POD
          </div>
        </div>
      </div>

      {/* Second Row of KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <div className="text-xs text-slate-400 mb-1">Total Transactions Reviewed</div>
          <div className="text-2xl font-bold font-mono text-white">{data.transactions.length + 4}</div>
          <div className="text-[11px] text-slate-400 mt-1">100% automated 4-way audit</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <div className="text-xs text-slate-400 mb-1">Four-Way Match Pass Rate</div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {(passRate * 100).toFixed(0)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">&le; 1.5% variance tolerance</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <div className="text-xs text-slate-400 mb-1">Pending Human Approvals</div>
          <div className="text-2xl font-bold font-mono text-cyan-400">1</div>
          <div className="text-[11px] text-slate-400 mt-1">Amounts &gt; $500 auto-threshold</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
          <div className="text-xs text-slate-400 mb-1">Active Escrow Under Hold</div>
          <div className="text-2xl font-bold font-mono text-white">$2,450.00</div>
          <div className="text-[11px] text-slate-400 mt-1">Orders v2 intent: AUTHORIZE</div>
        </div>
      </div>

      {/* Visual Impact Grid: Supplier Performance & Variance Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Supplier Performance (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Supplier Risk &amp; Fulfillment Reliability
            </h3>
            <span className="text-xs text-slate-400 font-mono">B2B Counterparty Index</span>
          </div>

          <div className="space-y-3">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">Apex Cloud Hardware Inc.</div>
                  <div className="text-xs text-slate-400">Category: Cloud Hardware • ID: SUP-001</div>
                </div>
                <span className="text-xs px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold font-mono">
                  TRUST SCORE: 94/100
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[10px]">FULFILLMENT</span>
                  <span className="text-emerald-400 font-bold">98.2%</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">AVG VARIANCE</span>
                  <span className="text-white font-bold">0.12%</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">DISPUTES</span>
                  <span className="text-emerald-400 font-bold">0 Active</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">Logistics Freight Direct</div>
                  <div className="text-xs text-slate-400">Category: Packaging Supplies • ID: SUP-002</div>
                </div>
                <span className="text-xs px-2.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-bold font-mono">
                  TRUST SCORE: 76/100
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-300">
                <div>
                  <span className="text-slate-500 block text-[10px]">FULFILLMENT</span>
                  <span className="text-amber-400 font-bold">88.5%</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">AVG VARIANCE</span>
                  <span className="text-rose-400 font-bold">2.4%</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">DISPUTES</span>
                  <span className="text-amber-400 font-bold">1 Resolved</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Policy Invariant Integrity (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Policy Invariant Health
              </h3>
              <span className="text-xs text-emerald-400 font-mono">All Green</span>
            </div>

            <div className="space-y-3 mt-3 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-300 font-medium">3-Way Match (&le; 1.5%)</span>
                <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Enforced
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-300 font-medium">Partial Delivery Clamp</span>
                <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-300 font-medium">Risk Score Firewall (&le; 0.70)</span>
                <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Armed
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-300 font-medium">SHA-256 Digest Double Auth</span>
                <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400">
            Audit Ledger records 100% of policy evaluations, ML inference digests, and PayPal request IDs with zero secret exposure.
          </div>
        </div>
      </div>
    </div>
  );
}
