/**
 * Central API gate (Next.js 16 Proxy, Node.js runtime).
 *
 * Every /api request passes through here before reaching a route handler:
 *  1. Body size cap (Content-Length) for all writes; a tighter cap on paid AI/LLM routes.
 *  2. Per-client rate limit on routes that spend third-party quota (AI, Gemini, ML, Channel3,
 *     PayPal-calling demo routes).
 *  3. Access control for every mutating method (POST/PUT/PATCH/DELETE) via api-guard, so new
 *     routes are protected by default. Routes with their own authentication are exempt:
 *     the PayPal webhook (signature verification) and cron (CRON_SECRET bearer).
 *
 * Route handlers keep their own checks (e.g. strict operator-only actions); this is the
 * default-deny outer layer, not a replacement for them.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { checkOperatorAccess } from '@/lib/api-guard';
import { FixedWindowRateLimiter, clientKey } from '@/lib/rate-limit';

const SELF_AUTHENTICATED = [/^\/api\/paypal\/webhook\/?$/, /^\/api\/cron\//];
const QUOTA_SPENDING = [
  /^\/api\/ai\//,
  /^\/api\/gemini\//,
  /^\/api\/ml\/?$/,
  /^\/api\/channel3\/?$/,
  /^\/api\/red-team\/?$/,
  /^\/api\/test-bar\/?$/,
  /^\/api\/proofline\/projects\/[^/]+\/(scope-draft|change-orders\/analyze)\/?$/,
];
const SENSITIVE_READS = [/^\/api\/ai\/traces\/?$/];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const MAX_BODY_BYTES = 256 * 1024;
const MAX_AI_BODY_BYTES = 64 * 1024;

// 30 quota-spending calls per client per minute; operator-key callers are not limited.
const aiLimiter = new FixedWindowRateLimiter(30, 60_000);

const matches = (path: string, patterns: RegExp[]) => patterns.some((p) => p.test(path));

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (matches(path, SELF_AUTHENTICATED)) return NextResponse.next();

  const method = request.method.toUpperCase();
  const isWrite = !SAFE_METHODS.has(method);
  const quota = matches(path, QUOTA_SPENDING);

  if (isWrite) {
    const length = Number(request.headers.get('content-length') ?? '0');
    const cap = quota ? MAX_AI_BODY_BYTES : MAX_BODY_BYTES;
    if (Number.isFinite(length) && length > cap) {
      return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
    }
  }

  const access = checkOperatorAccess(request);

  if (quota && !access.operator) {
    const limit = aiLimiter.check(`${clientKey(request)}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }
  }

  // Reads that expose user-submitted content need the same access check as writes.
  if ((isWrite || matches(path, SENSITIVE_READS)) && !access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status ?? 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
