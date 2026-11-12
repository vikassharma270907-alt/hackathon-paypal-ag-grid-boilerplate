import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, publicOrigin } from '@/lib/auth';

export const runtime = 'nodejs';

function logout(req: NextRequest) {
  const res = NextResponse.redirect(`${publicOrigin(req)}/login`, { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const GET = logout;
export const POST = logout;
