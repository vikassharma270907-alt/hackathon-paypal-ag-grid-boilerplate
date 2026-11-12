/**
 * Judge-journey smoke test against a RUNNING RestockPilot server.
 *
 *   npm run smoke                                  # http://localhost:3000
 *   npm run smoke -- --base-url=https://your-app.onrender.com
 *
 * It RESETS the in-memory demo state, so only point it at a demo instance.
 * SIMULATED mode: walks the whole journey (approve, create, capture, replay, verify, receipt, refund).
 * SANDBOX mode: stops after creating the order, because capture needs a human to approve on PayPal.
 *   Use `npm run sandbox:verify` for the live capture and refund.
 * Exits 1 on the first failed check.
 */
import { AppClient, baseUrlFromArgs } from './lib/app-client';

type Json = Record<string, unknown>;
interface Po {
  id: string;
  decision: string;
  totalPrice: number;
  approvedByOwner: boolean;
}

const results: Array<{ name: string; pass: boolean; detail: string }> = [];

/** Thrown on the first failed check; reported once by main().catch with exit code 1. */
class CheckFailed extends Error {}

function check(name: string, pass: boolean, detail = ''): void {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  // No process.exit(): on Windows it can crash while fetch sockets close and lose exit code 1.
  if (!pass) throw new CheckFailed(name);
}

async function main(): Promise<void> {
  const baseUrl = baseUrlFromArgs(process.argv.slice(2));
  const api = new AppClient(baseUrl, process.env.OPERATOR_API_KEY || undefined);
  console.log(`RestockPilot smoke test against ${baseUrl}\n`);

  const health = await api.get<Json>('/api/health');
  check('health endpoint responds', health.ok, `HTTP ${health.status}`);
  const mode = String(health.body.paypalMode ?? 'UNKNOWN');
  console.log(`      PayPal mode reported by the server: ${mode}`);

  for (const page of ['/', '/demo', '/judges', '/evidence']) {
    const res = await fetch(`${baseUrl}${page}`, { signal: AbortSignal.timeout(30_000) });
    check(`page ${page} renders`, res.ok, `HTTP ${res.status}`);
  }

  const reset = await api.restock({ action: 'RESET' });
  check('reset demo state', reset.ok, reset.ok ? '' : `HTTP ${reset.status}: ${String((reset.body as Json).error ?? '')}`);

  const cycle = await api.restock<{ orders: Po[] }>({ action: 'RUN_CYCLE' });
  check('restock cycle drafts orders', cycle.ok && cycle.body.orders.length > 0, `${cycle.body.orders?.length ?? 0} orders`);
  const po = cycle.body.orders.find((o) => o.decision === 'ASK') ?? cycle.body.orders[0];

  if (!po.approvedByOwner) {
    const early = await api.restock<Json>({ action: 'CREATE_ORDER', poId: po.id });
    check('PayPal order refused before owner approval', early.status === 409, `HTTP ${early.status}`);
    const approve = await api.restock({ action: 'APPROVE_PO', poId: po.id });
    check('owner approves the order', approve.ok);
  }

  const created = await api.restock<Json>({ action: 'CREATE_ORDER', poId: po.id });
  check('PayPal order created after approval', created.ok && created.body.status === 'AWAITING_BUYER_APPROVAL', String(created.body.status));
  const orderId = String(created.body.paypalOrderId);

  const early = await api.restock<Json>({ action: 'RECONCILE', poId: po.id });
  check('reconcile refused for an order that was never paid', early.status === 409, `HTTP ${early.status}`);

  if (mode === 'SANDBOX') {
    const rb = await api.get<{ details?: Json }>(`/api/restock/verify?id=${encodeURIComponent(orderId)}`);
    check('live Sandbox read-back of the new order', rb.ok, `PayPal status ${String(rb.body.details?.status)}`);
    console.log(
      `\nSANDBOX mode: capture needs a buyer to approve on PayPal.\n` +
        `Approve here, then run "npm run sandbox:verify" for the full live capture and refund:\n  ${String(created.body.approveUrl)}\n`
    );
    return summary();
  }

  const spendBefore = Number((await api.get<Json>('/api/restock')).body.spendSoFar);
  const cap = await api.restock<Json>({ action: 'CAPTURE_ORDER', poId: po.id, paypalOrderId: orderId });
  check('capture succeeds', cap.ok && cap.body.success === true);
  const replay = await api.restock<Json>({ action: 'CAPTURE_ORDER', poId: po.id, paypalOrderId: orderId });
  check('capture replay makes no second charge', replay.ok && /Already captured/.test(String(replay.body.message)));
  const spendAfter = Number((await api.get<Json>('/api/restock')).body.spendSoFar);
  check('spend counted exactly once', Math.abs(spendAfter - spendBefore - po.totalPrice) < 0.005, `+${(spendAfter - spendBefore).toFixed(2)}`);

  const rb = await api.get<{ details?: Json }>(`/api/restock/verify?id=${encodeURIComponent(orderId)}`);
  check(
    'simulated read-back is labelled and invents no PayPal status',
    rb.ok && rb.body.details?.mode === 'SIMULATION' && !('status' in (rb.body.details ?? {})),
    String(rb.body.details?.mode)
  );
  const bad = await api.get(`/api/restock/verify?id=${encodeURIComponent('../../v1/oauth2/token')}`);
  check('malformed order id rejected', bad.status === 400, `HTTP ${bad.status}`);

  const signed = await api.post<{ receipt?: Json }>('/api/receipt', { action: 'SIGN', poId: po.id });
  if (signed.status === 500) {
    check('receipt signing configured', false, 'set RECEIPT_SIGNING_SECRET (required in production)');
  }
  const verdict = await api.post<Json>('/api/receipt', { action: 'VERIFY', receipt: signed.body.receipt ?? {} });
  check('signed receipt verifies', verdict.ok && verdict.body.valid === true);

  const refund = await api.restock<Json>({ action: 'REFUND_ORDER', poId: po.id });
  check('refund succeeds', refund.ok && refund.body.success === true, String(refund.body.mode));
  const spendFinal = Number((await api.get<Json>('/api/restock')).body.spendSoFar);
  check('refund restores the budget', Math.abs(spendFinal - spendBefore) < 0.005, `spend ${spendFinal.toFixed(2)}`);

  const cross = await fetch(`${baseUrl}/api/restock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify({ action: 'RESET' }),
  });
  check('cross-origin write refused', cross.status >= 400, `HTTP ${cross.status}`);

  summary();
}

function summary(): void {
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
}

main().catch((err: unknown) => {
  if (err instanceof CheckFailed) {
    console.error(`\nSmoke test failed at: ${err.message}`);
    summary();
  } else {
    console.error(`\nSmoke test crashed: ${err instanceof Error ? err.message : String(err)}`);
    console.error('Is the server running? Start it with "npm run dev" or "npm run build && npm start".');
  }
  process.exitCode = 1;
});
