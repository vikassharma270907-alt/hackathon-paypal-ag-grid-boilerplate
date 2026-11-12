import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeBasket,
  BasketRuleError,
  createBasketAuthorization,
  listBaskets,
  reconcileBasket,
  settleBasket,
} from '@/lib/paypal-basket';
import { restockStore } from '@/lib/restock-store';
import { getExecutionMode } from '@/lib/paypal';

/**
 * Authorize -> per-line approval -> partial capture.
 * Sandbox-only. Like /api/restock, these actions are unauthenticated: acceptable for the sandbox demo only.
 */
export async function GET() {
  return NextResponse.json({
    baskets: listBaskets(),
    executionMode: getExecutionMode(),
    spendSoFar: restockStore.spendSoFar,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: string;
      poIds?: unknown;
      basketId?: unknown;
      approvedPoIds?: unknown;
    };
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

    switch (body.action) {
      case 'CREATE':
        return NextResponse.json({ success: true, basket: await createBasketAuthorization(strings(body.poIds)) });
      case 'AUTHORIZE':
        return NextResponse.json({ success: true, basket: await authorizeBasket(String(body.basketId)) });
      case 'SETTLE':
        return NextResponse.json({
          success: true,
          basket: await settleBasket(String(body.basketId), strings(body.approvedPoIds)),
        });
      case 'RECONCILE':
        return NextResponse.json({ success: true, basket: await reconcileBasket(String(body.basketId)) });
      default:
        return NextResponse.json({ error: `Unknown action: ${String(body.action)}` }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof BasketRuleError) {
      return NextResponse.json({ error: err.message, violations: err.violations }, { status: 422 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
