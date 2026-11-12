import { describe, it, expect } from 'vitest';
import { validateLiveEvidence, formatEvidenceRow, type LiveRunEvidence } from '../scripts/lib/live-evidence';

const hex = (c: string) => c.repeat(64);
const good: LiveRunEvidence = {
  runAt: '2026-11-12T18:00:00.000Z',
  baseUrl: 'http://localhost:3000',
  poId: 'PO-CUPS-12OZ-500-ABC',
  sku: 'CUPS-12OZ-500',
  amountUsd: '304.00',
  paypalOrderId: '5O190127TN364715T',
  orderReadBackStatus: 'COMPLETED',
  paypalCaptureId: '3C679366HH908993F',
  paypalRefundId: '1JU08902781691411',
  refundStatus: 'COMPLETED',
  requestIdCreate: hex('a'),
  requestIdCapture: hex('b'),
  requestIdRefund: hex('c'),
};

describe('live Sandbox evidence guard', () => {
  it('accepts real-shaped Sandbox ids and writes one table row', () => {
    expect(validateLiveEvidence(good)).toEqual([]);
    const row = formatEvidenceRow(good);
    expect(row).toContain('`5O190127TN364715T`');
    expect(row).toContain('$304.00');
    expect(row.startsWith('|')).toBe(true);
  });

  it('refuses SIMULATED_ ids so simulation can never be recorded as live evidence', () => {
    const sim = { ...good, paypalOrderId: 'SIMULATED_ORD_X_123', paypalCaptureId: 'SIMULATED_CAP_X_1' };
    expect(validateLiveEvidence(sim).join(' ')).toMatch(/simulated or a placeholder/);
    expect(() => formatEvidenceRow(sim)).toThrow(/Refusing to record evidence/);
  });

  it('refuses placeholder and malformed ids', () => {
    expect(validateLiveEvidence({ ...good, paypalCaptureId: 'none (simulation, no PayPal call)' })).not.toEqual([]);
    expect(validateLiveEvidence({ ...good, paypalOrderId: 'ord-lowercase' })).not.toEqual([]);
  });

  it('requires PayPal to have reported the order COMPLETED on read-back', () => {
    expect(validateLiveEvidence({ ...good, orderReadBackStatus: 'APPROVED' }).join(' ')).toMatch(/expected COMPLETED/);
  });

  it('requires real SHA-256 idempotency keys', () => {
    expect(validateLiveEvidence({ ...good, requestIdCreate: 'abc' }).join(' ')).toMatch(/SHA-256/);
  });

  it('allows a run without a refund, but rejects a refund in an unexpected state', () => {
    const noRefund = { ...good, paypalRefundId: undefined, refundStatus: undefined, requestIdRefund: undefined };
    expect(validateLiveEvidence(noRefund)).toEqual([]);
    expect(validateLiveEvidence({ ...good, refundStatus: 'FAILED' }).join(' ')).toMatch(/refund status/);
  });
});
