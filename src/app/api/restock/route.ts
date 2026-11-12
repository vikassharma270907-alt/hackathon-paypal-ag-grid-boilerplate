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

export async function GET() {
  const mandate = restockStore.getMandate();
  const inventory = restockStore.getInventory();
  const calculations: ReorderCalculation[] = inventory.map(computeReorder);
  const purchaseOrders = Array.from(restockStore.purchaseOrders.values());
  const claims = Array.from(restockStore.claims.values());
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

