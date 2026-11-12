import { NextRequest, NextResponse } from 'next/server';
import { getPayPalOrderDetails } from '@/lib/paypal';

/**
 * Read-only PayPal order read-back used by the "Verify with PayPal GET" buttons on /demo and /evidence.
 *
 * Restored after it was lost in the recovery-baseline commit (the buttons 404'd). It never mutates state.
 * SIMULATED_ ids return the local record labelled SIMULATION (see getPayPalOrderDetails); anything else is
 * read from api-m.sandbox.paypal.com. Upstream error text is not echoed to the client.
 */
const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(req: NextRequest) {
  const orderId = new URL(req.url).searchParams.get('id');
  if (!orderId) {
    return NextResponse.json({ error: 'Missing required query parameter: id' }, { status: 400 });
  }
  if (!ORDER_ID.test(orderId)) {
    return NextResponse.json({ error: 'id must be 1-64 letters, digits, "_" or "-"' }, { status: 400 });
  }

  try {
    const details = await getPayPalOrderDetails(orderId);
    return NextResponse.json({ success: true, orderId, details, readAt: new Date().toISOString() });
  } catch (err: unknown) {
    const status = err instanceof Error && /HTTP 404/.test(err.message) ? 404 : 502;
    return NextResponse.json(
      { error: status === 404 ? 'PayPal has no order with this id' : 'PayPal read-back failed' },
      { status }
    );
  }
}
