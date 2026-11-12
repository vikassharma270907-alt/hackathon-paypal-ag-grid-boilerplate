import { NextResponse } from 'next/server';
import { getSystemHealth, markServiceAvailable, resyncAllServices } from '@/lib/system-health';
import { denyUnlessAuthorized } from '@/lib/api-guard';
import { getExecutionMode } from '@/lib/paypal';

export async function GET() {
  try {
    const services = getSystemHealth();
    const allOperational = services.every((s) => s.status === 'OPERATIONAL' || s.status === 'SIMULATED');
    return NextResponse.json({
      overallStatus: allOperational ? 'HEALTHY' : 'DEGRADED',
      // Derived from configured credentials on the server; the per-service entries below are
      // static catalog data, not live probes.
      paypalMode: getExecutionMode(),
      checkedAt: new Date().toISOString(),
      services,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Health check failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const denied = denyUnlessAuthorized(req, { strict: true });
    if (denied) return denied;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body must be a JSON object.' }, { status: 400 });
    }
    const action = body.action;

    if (action === 'mark-available') {
      const { serviceId } = body;
      const updated = markServiceAvailable(serviceId);
      return NextResponse.json({ success: true, service: updated });
    }

    if (action === 'resync') {
      const refreshed = resyncAllServices();
      return NextResponse.json({ success: true, services: refreshed });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    console.error('[health] action failed:', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
