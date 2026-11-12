/**
 * Live PayPal Sandbox verification: one real checkout, capture and refund, recorded as evidence.
 *
 *   1. Put SANDBOX credentials in .env.local (PAYPAL_CLIENT_ID, PAYPAL_SECRET) and start the app:
 *        npm run dev
 *   2. In another terminal:
 *        npm run sandbox:verify                       # captures, then refunds
 *        npm run sandbox:verify -- --no-refund        # keep the capture
 *        npm run sandbox:verify -- --base-url=https://your-app.onrender.com
 *   3. Open the printed PayPal link, log in with a SANDBOX *buyer* account
 *      (developer.paypal.com > Testing Tools > Sandbox Accounts) and approve.
 *
 * The script waits for PayPal to report the order APPROVED, captures it, reads it back, refunds it,
 * and appends one row to docs/evidence/live-sandbox-runs.md. It refuses to run in SIMULATED mode
 * and refuses to record any id that is simulated, missing, or not PayPal-shaped.
 * It RESETS the in-memory demo state first, so point it only at your own demo instance.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AppClient, baseUrlFromArgs } from './lib/app-client';
import { EVIDENCE_HEADER, formatEvidenceRow, validateLiveEvidence, type LiveRunEvidence } from './lib/live-evidence';

type Json = Record<string, unknown>;
interface Po {
  id: string;
  sku: string;
  decision: string;
  totalPrice: number;
  approvedByOwner: boolean;
}

const POLL_MS = 5_000;
const APPROVAL_TIMEOUT_MS = 15 * 60_000;
const EVIDENCE_FILE = path.resolve(process.cwd(), 'docs', 'evidence', 'live-sandbox-runs.md');

/** Thrown to stop the run; main() reports it once and the process exits with code 1. */
class StopRun extends Error {}

function fail(message: string): never {
  // Do not call process.exit(): on Windows, exiting while fetch keep-alive sockets are closing
  // trips a libuv assertion and replaces exit code 1 with a crash code.
  throw new StopRun(message);
}

function need(res: { ok: boolean; status: number; body: Json }, what: string): Json {
  if (!res.ok) fail(`${what}: HTTP ${res.status} ${String(res.body.error ?? res.body.message ?? '')}`);
  return res.body;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const refund = !argv.includes('--no-refund');
  const baseUrl = baseUrlFromArgs(argv);
  const api = new AppClient(baseUrl, process.env.OPERATOR_API_KEY || undefined);
  console.log(`Live PayPal Sandbox verification against ${baseUrl}\n`);

  const health = need(await api.get<Json>('/api/health'), 'health check');
  if (health.paypalMode !== 'SANDBOX') {
    fail(
      `the server reports PayPal mode "${String(health.paypalMode)}". Set real SANDBOX credentials ` +
        '(PAYPAL_CLIENT_ID and PAYPAL_SECRET) in .env.local and restart the app. Nothing was recorded.'
    );
  }

  need(await api.restock({ action: 'RESET' }), 'reset');
  const cycle = need(await api.restock({ action: 'RUN_CYCLE' }), 'restock cycle') as { orders?: Po[] };
  const orders = (cycle.orders ?? []).filter((o) => o.decision !== 'BLOCK');
  if (orders.length === 0) fail('the restock cycle produced no payable order');
  // The smallest order keeps the Sandbox buyer balance healthy across repeated runs.
  const po = orders.reduce((a, b) => (b.totalPrice < a.totalPrice ? b : a));
  console.log(`Purchase order: ${po.id} (${po.sku}) $${po.totalPrice.toFixed(2)} [policy ${po.decision}]`);

  if (!po.approvedByOwner) {
    need(await api.restock({ action: 'APPROVE_PO', poId: po.id }), 'owner approval');
    console.log('Owner approval recorded (this script acts as the cafe owner).');
  }

  const created = need(await api.restock({ action: 'CREATE_ORDER', poId: po.id }), 'create PayPal order');
  const orderId = String(created.paypalOrderId ?? '');
  if (!orderId || orderId.startsWith('SIMULATED_')) fail(`server returned a simulated order id (${orderId})`);
  console.log(`\nPayPal Sandbox order created: ${orderId}`);
  console.log('Approve it as the Sandbox BUYER, then come back here:');
  console.log(`  ${String(created.approveUrl)}\n`);

  const deadline = Date.now() + APPROVAL_TIMEOUT_MS;
  let status = '';
  while (Date.now() < deadline) {
    const rb = await api.get<{ details?: Json }>(`/api/restock/verify?id=${encodeURIComponent(orderId)}`);
    status = String(rb.body.details?.status ?? `HTTP ${rb.status}`);
    if (status === 'APPROVED' || status === 'COMPLETED') break;
    process.stdout.write(`  waiting for buyer approval (PayPal status: ${status})\r`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  if (status !== 'APPROVED' && status !== 'COMPLETED') fail(`buyer did not approve within 15 minutes (status ${status})`);
  console.log(`\nPayPal reports the order ${status}.`);

  const cap = need(await api.restock({ action: 'CAPTURE_ORDER', poId: po.id, paypalOrderId: orderId }), 'capture');
  if (cap.success !== true) fail(`capture did not complete: ${String(cap.message ?? cap.status)}`);
  console.log(`Captured: ${String(cap.paypalCaptureId)}`);

  const after = await api.get<{ details?: Json }>(`/api/restock/verify?id=${encodeURIComponent(orderId)}`);
  const readBack = String(after.body.details?.status ?? `HTTP ${after.status}`);
  console.log(`Read-back from PayPal after capture: ${readBack}`);

  let refundBody: Json = {};
  if (refund) {
    refundBody = need(await api.restock({ action: 'REFUND_ORDER', poId: po.id }), 'refund');
    console.log(`Refund ${String(refundBody.refundId)}: ${String(refundBody.refundStatus)} (${String(refundBody.message ?? '')})`);
  }

  const evidence: LiveRunEvidence = {
    runAt: new Date().toISOString(),
    baseUrl,
    poId: po.id,
    sku: po.sku,
    amountUsd: po.totalPrice.toFixed(2),
    paypalOrderId: orderId,
    orderReadBackStatus: readBack,
    paypalCaptureId: String(cap.paypalCaptureId ?? ''),
    paypalRefundId: refund ? String(refundBody.refundId ?? '') || undefined : undefined,
    refundStatus: refund ? String(refundBody.refundStatus ?? '') || undefined : undefined,
    requestIdCreate: String(created.paypalRequestIdCreate ?? ''),
    requestIdCapture: String(cap.paypalRequestIdCapture ?? ''),
    requestIdRefund: refund ? String(refundBody.paypalRequestIdRefund ?? '') || undefined : undefined,
  };

  const problems = validateLiveEvidence(evidence);
  if (problems.length > 0) fail(`not recording evidence: ${problems.join('; ')}`);

  fs.mkdirSync(path.dirname(EVIDENCE_FILE), { recursive: true });
  if (!fs.existsSync(EVIDENCE_FILE)) {
    fs.writeFileSync(
      EVIDENCE_FILE,
      '# Live PayPal Sandbox runs\n\n' +
        'Written only by `npm run sandbox:verify`. Every id below was returned by api-m.sandbox.paypal.com ' +
        'during a real buyer-approved Sandbox checkout. Sandbox money only; no real funds moved.\n\n' +
        `${EVIDENCE_HEADER}\n`
    );
  }
  fs.appendFileSync(EVIDENCE_FILE, `${formatEvidenceRow(evidence)}\n`);
  console.log(`\nRecorded in ${path.relative(process.cwd(), EVIDENCE_FILE)}. Verify any id yourself on /evidence.`);
}

main().catch((err: unknown) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
