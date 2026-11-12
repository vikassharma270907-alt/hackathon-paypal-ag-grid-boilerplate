import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { runRestockCycle } from '@/lib/restock-cycle';
import { restockStore } from '@/lib/restock-store';

/**
 * Daily "morning run": drafts restock proposals from net-inventory math and the policy gate.
 *
 * Safety properties:
 *  - Fails closed: if CRON_SECRET is not configured the endpoint is disabled (503).
 *  - Authenticated with `Authorization: Bearer <CRON_SECRET>` (compared in constant time).
 *  - Drafts only. It never calls PayPal, never approves, never captures. Every draft (even policy ALLOW)
 *    waits for the owner. Re-runs are idempotent: SKUs with an open order are skipped.
 *
 * Schedule it with Render Cron / Vercel Cron / GitHub Actions hitting GET or POST here.
 */
function authorized(req: NextRequest): { ok: boolean; status?: number; error?: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, error: 'Morning run disabled: CRON_SECRET is not configured' };
  const header = req.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b) ? { ok: true } : { ok: false, status: 401, error: 'Unauthorized' };
}

async function handle(req: NextRequest) {
  const auth = authorized(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { orders, skipped } = runRestockCycle({ autoApproveAllow: false, skipSkusWithOpenOrder: true });
  return NextResponse.json({
    success: true,
    ranAt: new Date().toISOString(),
    draftsCreated: orders.length,
    drafts: orders.map((o) => ({
      id: o.id,
      sku: o.sku,
      qty: o.qty,
      totalPrice: o.totalPrice,
      decision: o.decision,
      approvedByOwner: o.approvedByOwner,
    })),
    skipped,
    spendSoFar: restockStore.spendSoFar,
    note: 'Drafts only. Nothing was approved, ordered, or paid; the owner must approve in the RestockPilot UI.',
  });
}

export const GET = handle;
export const POST = handle;
