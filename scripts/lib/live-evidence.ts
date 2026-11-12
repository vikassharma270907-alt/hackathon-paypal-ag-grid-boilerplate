/**
 * Pure helpers for scripts/sandbox-verify.ts (no I/O, unit-tested in tests/live-evidence.test.ts).
 *
 * Rule: evidence is only ever built from values PayPal returned during a real Sandbox run.
 * Anything simulated, missing, or placeholder-shaped is rejected rather than written.
 */

export interface LiveRunEvidence {
  runAt: string; // ISO timestamp of the run
  baseUrl: string;
  poId: string;
  sku: string;
  amountUsd: string; // "304.00"
  paypalOrderId: string;
  orderReadBackStatus: string; // status PayPal reported on GET after capture
  paypalCaptureId: string;
  paypalRefundId?: string;
  refundStatus?: string;
  requestIdCreate: string;
  requestIdCapture: string;
  requestIdRefund?: string;
}

const PLACEHOLDER = /^(SIMULATED_|SIM-|SEEDED|none|placeholder|your_|test-)/i;
// PayPal order/capture/refund ids are 17-char uppercase alphanumerics in practice; accept 10-40.
const PAYPAL_ID = /^[A-Z0-9]{10,40}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

/** Returns a list of problems; an empty list means the evidence may be written. */
export function validateLiveEvidence(e: LiveRunEvidence): string[] {
  const problems: string[] = [];
  const ids: Array<[string, string | undefined, boolean]> = [
    ['paypalOrderId', e.paypalOrderId, true],
    ['paypalCaptureId', e.paypalCaptureId, true],
    ['paypalRefundId', e.paypalRefundId, false],
  ];
  for (const [name, value, required] of ids) {
    if (value === undefined || value === '') {
      if (required) problems.push(`${name} is missing`);
      continue;
    }
    if (PLACEHOLDER.test(value)) problems.push(`${name} is simulated or a placeholder (${value})`);
    else if (!PAYPAL_ID.test(value)) problems.push(`${name} does not look like a PayPal id (${value})`);
  }
  for (const [name, value, required] of [
    ['requestIdCreate', e.requestIdCreate, true],
    ['requestIdCapture', e.requestIdCapture, true],
    ['requestIdRefund', e.requestIdRefund, false],
  ] as Array<[string, string | undefined, boolean]>) {
    if (!value) {
      if (required) problems.push(`${name} is missing`);
    } else if (!SHA256_HEX.test(value)) problems.push(`${name} is not a SHA-256 hex digest`);
  }
  if (e.orderReadBackStatus !== 'COMPLETED') {
    problems.push(`order read-back status is ${e.orderReadBackStatus || 'missing'}, expected COMPLETED`);
  }
  if (!/^\d+\.\d{2}$/.test(e.amountUsd)) problems.push(`amount ${e.amountUsd} is not a 2-decimal USD value`);
  if (e.paypalRefundId && e.refundStatus !== 'COMPLETED' && e.refundStatus !== 'PENDING') {
    problems.push(`refund status ${e.refundStatus ?? 'missing'} is not COMPLETED or PENDING`);
  }
  return problems;
}

/** One Markdown table row. Throws if the evidence is not valid live evidence. */
export function formatEvidenceRow(e: LiveRunEvidence): string {
  const problems = validateLiveEvidence(e);
  if (problems.length > 0) throw new Error(`Refusing to record evidence: ${problems.join('; ')}`);
  const cell = (v: string | undefined) => (v ? `\`${v}\`` : '—');
  return [
    '',
    e.runAt,
    `${e.poId} (${e.sku})`,
    `$${e.amountUsd}`,
    cell(e.paypalOrderId),
    e.orderReadBackStatus,
    cell(e.paypalCaptureId),
    cell(e.paypalRefundId),
    e.refundStatus ?? '—',
    cell(e.requestIdCreate.slice(0, 16) + '…'),
    '',
  ].join(' | ').trim();
}

export const EVIDENCE_HEADER = [
  '| Run at (UTC) | Purchase order | Amount | PayPal Order ID | Order read-back | Capture ID | Refund ID | Refund status | PayPal-Request-Id (create) |',
  '|---|---|---|---|---|---|---|---|---|',
].join('\n');
