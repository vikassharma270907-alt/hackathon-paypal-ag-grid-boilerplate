import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  GUEST_TTL_SECONDS,
  SESSION_COOKIE,
  cookieOptions,
  createSessionToken,
  publicOrigin,
  safeNext,
} from '@/lib/auth';

export const runtime = 'nodejs';

/** Starts a short-lived anonymous demo session. GET so it works from a plain link/button. */
export function GET(req: NextRequest) {
  const id = crypto.randomBytes(4).toString('hex');
  const token = createSessionToken(
    {
      id: `guest:${id}`,
      name: `Guest Demo ${id.slice(0, 4).toUpperCase()}`,
      email: 'guest@demo.verisettle.local',
      provider: 'guest',
    },
    GUEST_TTL_SECONDS
  );
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const res = NextResponse.redirect(`${publicOrigin(req)}${next}`);
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(GUEST_TTL_SECONDS));
  return res;
}
