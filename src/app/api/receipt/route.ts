import { NextRequest, NextResponse } from 'next/server';
import { restockStore } from '@/lib/restock-store';
import {
  getReceiptPublicKeyPem,
  signReceiptEd25519,
  verifyReceiptEd25519,
  type Ed25519Receipt,
} from '@/lib/receipt-ed25519';
import { aiBudgetStatus } from '@/lib/ai-budget';

/** Public key + AI budget status. The public key is all a third party needs to verify a receipt. */
export async function GET() {
  return NextResponse.json({
    algorithm: 'Ed25519',
    publicKeyPem: getReceiptPublicKeyPem(),
    aiBudget: aiBudgetStatus(),
  });
}

/**
 * action=SIGN   { poId }    -> Ed25519-signed docket for a stored purchase order
 * action=VERIFY { receipt } -> { valid, reason? } (verifies with the server public key)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'SIGN') {
      const po = restockStore.getPurchaseOrder(body.poId);
      if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
      const claim = restockStore.getClaim(po.id);
      const receipt = signReceiptEd25519({
        poId: po.id,
        sku: po.sku,
        merchant: po.merchantName,
        qty: po.qty,
        unitPrice: po.unitPrice,
        totalPrice: po.totalPrice,
        verifiedMedianPrice: po.verifiedMedianPrice,
        decision: po.decision,
        reasons: po.reasons,
        triggerQuote: po.triggerQuote,
        contractHash: claim?.contractHash,
        paypalOrderId: claim?.paypalOrderId,
        paypalCaptureId: claim?.paypalCaptureId,
        claimStatus: claim?.status ?? 'NOT_ORDERED',
      });
      return NextResponse.json({ receipt, publicKeyPem: getReceiptPublicKeyPem() });
    }

    // Fixed, non-sensitive sample so /verify works without first creating a purchase order.
    // Only this constant payload can be signed here; callers cannot choose what gets signed.
    if (body.action === 'SAMPLE') {
      const receipt = signReceiptEd25519({
        poId: 'PO-SAMPLE-ESPRESSO',
        sku: 'ESPRESSO-5LB',
        merchant: 'RoastSupply Co',
        qty: 14,
        unitPrice: 62,
        totalPrice: 868,
        verifiedMedianPrice: 63.25,
        decision: 'ASK',
        claimStatus: 'NOT_ORDERED',
        note: 'Sample receipt for the /verify page',
      });
      return NextResponse.json({ receipt, publicKeyPem: getReceiptPublicKeyPem() });
    }

    if (body.action === 'VERIFY') {
      return NextResponse.json(verifyReceiptEd25519(body.receipt as Ed25519Receipt));
    }

    return NextResponse.json({ error: `Unknown action: ${String(body.action)}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
