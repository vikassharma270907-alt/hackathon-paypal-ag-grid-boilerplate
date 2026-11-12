import { NextRequest, NextResponse } from 'next/server';
import { restockStore } from '@/lib/restock-store';
import { computeReorder, type ReorderCalculation } from '@/lib/policy';
import {
  createOrderForRestock,
  captureApprovedOrder,
  reconcileUnknownOrder,
  refundCapturedOrder,
  getExecutionMode,
} from '@/lib/paypal';
import { runRestockCycle } from '@/lib/restock-cycle';
import { checkOperatorAccess, denyUnlessAuthorized, rejectOversizedBody } from '@/lib/api-guard';

export async function GET(req?: NextRequest) {
  const mandate = restockStore.getMandate();
  const inventory = restockStore.getInventory();
  const calculations: ReorderCalculation[] = inventory.map(computeReorder);
  const purchaseOrders = Array.from(restockStore.purchaseOrders.values());
  // Raw PayPal error bodies can contain internal detail; only the operator sees them.
  const isOperator = req ? checkOperatorAccess(req, { strict: true }).operator : false;
  const claims = Array.from(restockStore.claims.values()).map((c) =>
    isOperator || !c.errorDetails ? c : { ...c, errorDetails: 'Redacted. Operator credentials required.' }
  );
  const ledger = restockStore.getLedger();
  const executionMode = getExecutionMode();

  return NextResponse.json({
    mandate,
    inventory,
    calculations,
    purchaseOrders,
    claims,
    ledger,
    executionMode,
    spendSoFar: restockStore.spendSoFar,
    remainingBudget: Math.max(0, mandate.monthlyBudget - restockStore.spendSoFar),
  });
}

// Actions that must never be reachable through the public sandbox-demo path.
// REFUND_RESTORE_BUDGET frees spend budget without moving money, so it needs the operator key.
// RESET only clears in-memory sandbox demo state and stays available to the guarded demo path.
const STRICT_ACTIONS = new Set(["REFUND_RESTORE_BUDGET"]);

export async function POST(req: NextRequest) {
  try {
    const denied = denyUnlessAuthorized(req);
    if (denied) return denied;
    const tooLarge = rejectOversizedBody(req, 16_384);
    if (tooLarge) return tooLarge;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof body.action !== "string") {
      return NextResponse.json({ error: "Body must be a JSON object with a string 'action'." }, { status: 400 });
    }
    const action = body.action as string;

    if (STRICT_ACTIONS.has(action)) {
      const strictDenied = denyUnlessAuthorized(req, { strict: true });
      if (strictDenied) return strictDenied;
    }

    if (action === "RESET") {
      restockStore.reset();
      return NextResponse.json({ success: true, message: "RestockPilot store reset to seeded café state." });
    }

    if (action === "RUN_CYCLE") {
      const { orders: newOrders } = runRestockCycle({ autoApproveAllow: true });
      return NextResponse.json({
        success: true,
        ordersCreated: newOrders.length,
        orders: newOrders,
        summary: `Cycle executed: ${newOrders.length} purchase order(s) generated.`,
      });
    }

    if (action === "APPROVE_PO") {
      const { poId } = body;
      const po = restockStore.getPurchaseOrder(poId);
      if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });

      po.approvedByOwner = true;
      po.approvedAt = new Date().toISOString();
      restockStore.savePurchaseOrder(po);

      return NextResponse.json({ success: true, po });
    }

    if (action === "CREATE_ORDER") {
      const { poId } = body;
      const result = await createOrderForRestock(poId);
      return NextResponse.json(result);
    }

    if (action === "CAPTURE_ORDER") {
      const { poId, paypalOrderId } = body;
      const result = await captureApprovedOrder(poId, paypalOrderId);
      return NextResponse.json(result);
    }

    if (action === "REFUND_ORDER") {
      const { poId, reason } = body;
      const result = await refundCapturedOrder(poId, typeof reason === "string" ? reason : undefined);
      return NextResponse.json(result);
    }

    if (action === "REFUND_RESTORE_BUDGET") {
      const { poId, reason } = body;
      const result = restockStore.restoreBudgetForRefund(poId, typeof reason === "string" ? reason : undefined);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === "RECONCILE") {
      const { poId } = body;
      const claim = await reconcileUnknownOrder(poId);
      return NextResponse.json({ success: true, claim });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // A concurrent money action, or a payment rule refusing the request, is a conflict, not a server fault.
    const status =
      err instanceof Error && (err.name === 'PaymentInProgressError' || err.name === 'PaymentRuleError') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

