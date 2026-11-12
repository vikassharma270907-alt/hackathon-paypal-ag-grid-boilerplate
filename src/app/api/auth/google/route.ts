import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_COOKIE, cookieOptions, encodeSigned, publicOrigin, safeNext } from '@/lib/auth';

export const runtime = 'nodejs';

export function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const origin = publicOrigin(req);
  if (!clientId) {
    return NextResponse.redirect(`${origin}/login?error=google_not_configured`);
  }

  const state = crypto.randomBytes(16).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const next = safeNext(req.nextUrl.searchParams.get('next'));

  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || `${origin}/api/auth/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  const res = NextResponse.redirect(url.toString());
  res.cookies.set(
    OAUTH_COOKIE,
    encodeSigned({ state, verifier, next, exp: Math.floor(Date.now() / 1000) + 600 }),
    cookieOptions(600)
  );
  return res;
}
