/**
 * Minimal session layer: an HMAC-signed, httpOnly cookie. No database required.
 * Supports Google OAuth users and anonymous "guest demo" users.
 */
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'vs_session';
export const OAUTH_COOKIE = 'vs_oauth';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
export const GUEST_TTL_SECONDS = 60 * 60 * 2; // 2 hours

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
  provider: 'google' | 'guest';
  /** Unix seconds */
  exp: number;
}

function secret(): string {
  const s = process.env.AUTH_SECRET?.trim();
  if (s && s.length >= 16) return s;
  // Fallback: derive a dedicated signing key from the operator key (never used directly),
  // so deployments that predate AUTH_SECRET keep working without sharing raw key material.
  const op = process.env.OPERATOR_API_KEY?.trim();
  if (op && op.length >= 16) {
    return crypto.createHmac('sha256', op).update('verisettle-session-signing-v1').digest('hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET (min 16 chars) must be set in production.');
  }
  return 'dev-only-insecure-auth-secret-change-me';
}

/**
 * Public origin of the request. Behind a reverse proxy (Render, Cloudflare) `req.nextUrl.origin`
 * can be the internal address, so prefer the forwarded host/proto headers.
 */
export function publicOrigin(req: { headers: Headers; nextUrl: { origin: string; protocol: string } }): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const host = req.headers.get('x-forwarded-host')?.split(',')[0].trim() || req.headers.get('host')?.trim();
  if (!host || !/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) return req.nextUrl.origin;
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || req.nextUrl.protocol.replace(':', '') || 'https';
  return `${proto === 'http' || proto === 'https' ? proto : 'https'}://${host}`;
}

const b64u = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeSigned(data: object): string {
  const payload = b64u(JSON.stringify(data));
  return `${payload}.${sign(payload)}`;
}

export function decodeSigned<T extends { exp?: number }>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null; // no signing secret configured: treat every token as invalid (fail closed)
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T;
    if (typeof data.exp === 'number' && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function createSessionToken(user: Omit<SessionUser, 'exp'>, ttlSeconds = SESSION_TTL_SECONDS): string {
  return encodeSigned({ ...user, exp: Math.floor(Date.now() / 1000) + ttlSeconds });
}

export function readSessionToken(token: string | undefined | null): SessionUser | null {
  return decodeSigned<SessionUser>(token);
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/** Only allow same-site relative redirect targets. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/dashboard';
  return value;
}
