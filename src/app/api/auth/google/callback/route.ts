import { NextRequest, NextResponse } from 'next/server';
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  cookieOptions,
  createSessionToken,
  decodeSigned,
  publicOrigin,
  safeNext,
} from '@/lib/auth';

export const runtime = 'nodejs';

interface OAuthCookie {
  state: string;
  verifier: string;
  next: string;
  exp: number;
}

interface GoogleUserInfo {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string;
}

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const fail = (code: string) => {
    const res = NextResponse.redirect(`${origin}/login?error=${code}`);
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return fail('google_denied');

  const code = params.get('code');
  const state = params.get('state');
  const saved = decodeSigned<OAuthCookie>(req.cookies.get(OAUTH_COOKIE)?.value);
  if (!code || !state || !saved || saved.state !== state) return fail('invalid_state');

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return fail('google_not_configured');

  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim() || `${origin}/api/auth/google/callback`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: saved.verifier,
      }),
    });
    if (!tokenRes.ok) return fail('token_exchange_failed');
    const { access_token } = (await tokenRes.json()) as { access_token?: string };
    if (!access_token) return fail('token_exchange_failed');

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!infoRes.ok) return fail('userinfo_failed');
    const info = (await infoRes.json()) as GoogleUserInfo;
    if (!info.sub || !info.email || info.email_verified === false) return fail('email_unverified');

    const token = createSessionToken({
      id: `google:${info.sub}`,
      name: info.name || info.email,
      email: info.email,
      picture: info.picture,
      provider: 'google',
    });

    const res = NextResponse.redirect(`${origin}${safeNext(saved.next)}`);
    res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_SECONDS));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  } catch {
    return fail('google_error');
  }
}
