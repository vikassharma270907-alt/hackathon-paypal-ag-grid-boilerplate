import { NextRequest, NextResponse } from 'next/server';
import { SEEDED_MANDATE } from '@/lib/restock-store';
import { normalizeRedTeamInput, runRedTeam, RED_TEAM_PRESETS } from '@/lib/redteam';

/**
 * Red-team console API. Read-only and side-effect free: it never touches the store, PayPal, or any model.
 * It evaluates a submitted listing against the SEEDED mandate (a fixed copy, so visitors cannot alter the
 * live demo state) using the production policy functions.
 */
export async function GET() {
  return NextResponse.json({ presets: RED_TEAM_PRESETS, mandate: SEEDED_MANDATE });
}

const MAX_BODY_BYTES = 8_000;

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }
    const input = normalizeRedTeamInput(JSON.parse(text));
    return NextResponse.json(runRedTeam(input, SEEDED_MANDATE));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid request';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
