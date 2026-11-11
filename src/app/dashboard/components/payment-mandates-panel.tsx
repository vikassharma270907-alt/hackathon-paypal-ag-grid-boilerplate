'use client';

import { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Lock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Hash,
  Clock,
  UserCheck,
  Send,
  FileCheck,
  RefreshCw,
  Info,
} from 'lucide-react';
import { PaymentMandate } from '@/lib/domain-models';

export function PaymentMandatesPanel() {
  const [mandates, setMandates] = useState<PaymentMandate[]>([]);
  const [selectedMandate, setSelectedMandate] = useState<PaymentMandate | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<string | null>(null);

  // Approval card state
  const [approvalStatus, setApprovalStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [approvedDigest, setApprovedDigest] = useState<string | null>(null);

  const fetchMandates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mandates');
      const data = await res.json();
      if (data.mandates && data.mandates.length > 0) {
        setMandates(data.mandates);
        setSelectedMandate(data.mandates[0]);
      }
    } catch (_err) {
      // Handle error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMandates();
  }, []);

  const verifySignature = async (id: string) => {
    setVerifyStatus('Verifying cryptographic Ed25519 signature...');
    try {
      const res = await fetch(`/api/mandates/${id}/verify`, { method: 'POST' });
      const data = await res.json();
      if (data.verified) {
        setVerifyStatus(`✓ Cryptographic Ed25519 signature verified successfully (Digest: ${data.digest.slice(0, 16)}...)`);
      } else {
        setVerifyStatus(`✗ Signature verification failed: ${data.reason || 'Invalid signature'}`);
      }
    } catch (_err) {
      setVerifyStatus('Verification failed due to network error.');
    }
  };

  const handleApprove = async () => {
    try {
      const res = await fetch('/api/settlements/PO-2026-001/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mandateId: selectedMandate?.mandateId || 'VM-001',
          approverIdentity: 'operations.director@verisettle.internal',
          authorizedAmount: 2450.0,
          transactionDigest: '7a9184c9802e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca4959',
          action: 'APPROVE',
        }),
      });
      const data = await res.json();
      setApprovalStatus('APPROVED');
      setApprovedDigest(data.transactionDigest);
    } catch (_e) {
      // Handle error
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              Cryptographic Payment Mandates &amp; Policy Firewall
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Spend Mandate governance enforced by Ed25519 asymmetric signatures, FIPS 180-4 SHA-256 digests, and single-use anti-replay nonces.
          </p>
        </div>

        <button
          onClick={fetchMandates}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Mandates</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Mandate Details & Key Card (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-bold text-white uppercase tracking-wider">
                Active Mandate: {selectedMandate?.mandateId || 'VM-001'}
              </span>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
              SEALED &amp; ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Supplier Bound</span>
              <span className="font-semibold text-white">{selectedMandate?.supplierName}</span>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">{selectedMandate?.supplierId}</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Per-Order Cap</span>
              <span className="font-semibold font-mono text-emerald-400 text-base">
                ${selectedMandate?.maxOrderAmount.toFixed(2)} {selectedMandate?.currency}
              </span>
              <div className="text-[11px] text-slate-400 mt-0.5">Auto-Approve: &le; ${selectedMandate?.humanApprovalRequiredAbove.toFixed(2)}</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Weekly Budget Cap</span>
              <span className="font-semibold font-mono text-cyan-400 text-base">
                ${selectedMandate?.maxWeeklyBudget.toFixed(2)} {selectedMandate?.currency}
              </span>
              <div className="text-[11px] text-slate-400 mt-0.5">Spent: ${selectedMandate?.currentWeeklySpend.toFixed(2)}</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Max Invoice Variance</span>
              <span className="font-semibold font-mono text-purple-400 text-base">
                {selectedMandate?.maxInvoiceVariancePct.toFixed(1)}%
              </span>
              <div className="text-[11px] text-slate-400 mt-0.5">Fail-closed above threshold</div>
            </div>
          </div>

          {/* Cryptographic Digests & Signature */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between pb-1 border-b border-slate-800/80 font-sans text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-blue-400" />
                <span>SHA-256 Canonical Mandate Digest</span>
              </span>
              <button
                onClick={() => selectedMandate && verifySignature(selectedMandate.mandateId)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-sans font-bold cursor-pointer"
              >
                Verify Ed25519
              </button>
            </div>
            <div className="text-slate-400 text-[11px] break-all bg-slate-900 p-2 rounded border border-slate-800">
              {selectedMandate?.mandateDigest || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
            </div>
            <div className="text-slate-500 text-[10px] font-sans flex justify-between">
              <span>Algorithm: Ed25519 (FIPS 186-5)</span>
              <span>Expires: {selectedMandate?.expiresAt || '2027-11-13T00:00:00Z'}</span>
            </div>

            {verifyStatus && (
              <div className="p-2.5 mt-2 rounded bg-indigo-950/60 border border-indigo-800 text-[11px] font-sans text-indigo-300">
                {verifyStatus}
              </div>
            )}
          </div>
        </div>

        {/* Human Approval Card Binding (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-white uppercase tracking-wider">
                  Human Approval Gate
                </span>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${
                approvalStatus === 'APPROVED'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}>
                {approvalStatus}
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-2">
              Amount exceeds the $500.00 auto-approve policy threshold. An authorized business officer must cryptographically bind this release.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Transaction:</span>
                <span className="font-mono text-white font-semibold">PO-2026-001 (Apex Edge Switch)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Authorized Hold:</span>
                <span className="font-mono text-slate-300">$2,450.00 USD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Verified Eligible:</span>
                <span className="font-mono text-emerald-400 font-bold">$2,450.00 USD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Officer Identity:</span>
                <span className="font-mono text-slate-300">operations.director@verisettle.internal</span>
              </div>
              {approvedDigest && (
                <div className="pt-2 border-t border-slate-800 text-[10px] font-mono text-slate-400 break-all">
                  <span className="text-slate-500 block">Approval Digest:</span>
                  {approvedDigest}
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex gap-2">
            <button
              onClick={handleApprove}
              disabled={approvalStatus === 'APPROVED'}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{approvalStatus === 'APPROVED' ? 'Approval Bound' : 'Approve & Bind Digest'}</span>
            </button>
            <button
              onClick={() => setApprovalStatus('REJECTED')}
              disabled={approvalStatus === 'REJECTED'}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-rose-400 rounded-xl text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
