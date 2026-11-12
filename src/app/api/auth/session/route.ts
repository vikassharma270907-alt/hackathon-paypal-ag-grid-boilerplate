import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

export function GET(req: NextRequest) {
  const user = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json(
    { user: user ? { name: user.name, email: user.email, picture: user.picture, provider: user.provider } : null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
