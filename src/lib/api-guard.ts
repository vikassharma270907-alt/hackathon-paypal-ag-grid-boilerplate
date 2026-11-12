/**
 * Server-side guard for mutating / privileged API routes.
 *
 * Policy (fail closed):
 *  1. A caller presenting the operator key (OPERATOR_API_KEY) via `Authorization: Bearer` or
 *     `x-operator-key` is always allowed.
 *  2. Outside production (development, test) requests are allowed, but a cross-site browser
 *     request (Origin host differs from Host) is rejected so a random web page cannot drive the API.
 *  3. In production, without the operator key, a request is allowed only when the deployment
 *     explicitly opted in to public sandbox demo writes (ALLOW_PUBLIC_DEMO_WRITES=true), PayPal is
 *     in SANDBOX, and the browser request is same-origin.
 *  4. `strict` actions (e.g. budget manipulation, admin role) never use the public demo path.
 *
 * The guard never reads secrets into responses and never logs the presented key.
 */
import crypto from 'node:crypto';

export interface GuardResult {
  ok: boolean;
  status?: 401 | 403 | 503;
  error?: string;
  /** True when the caller proved knowledge of the operator key. */
  operator: boolean;
}

function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

function presentedKey(req: Request): string | null {
  const bearer = req.headers.get('authorization');
  if (bearer && /^Bearer\s+/i.test(bearer)) return bearer.replace(/^Bearer\s+/i, '').trim();
  return req.headers.get('x-operator-key');
}

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host') ?? new URL(req.url).host;
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';
  return false; // no Origin and no Fetch-Metadata: cannot prove same-origin
}

export function checkOperatorAccess(
  req: Request,
  opts: { strict?: boolean; env?: NodeJS.ProcessEnv } = {}
): GuardResult {
  const env = opts.env ?? process.env;
  const configuredKey = env.OPERATOR_API_KEY?.trim();
  const key = presentedKey(req);

  if (configuredKey && key && crypto.timingSafeEqual(digest(key), digest(configuredKey))) {
    return { ok: true, operator: true };
  }
  if (key && configuredKey) {
    return { ok: false, status: 401, error: 'Invalid operator credentials.', operator: false };
  }

  const isProduction = env.NODE_ENV === 'production';
  const hasBrowserHints = Boolean(req.headers.get('origin') || req.headers.get('sec-fetch-site'));

  if (!isProduction) {
    if (hasBrowserHints && !isSameOrigin(req)) {
      return { ok: false, status: 403, error: 'Cross-origin requests are not allowed.', operator: false };
    }
    return { ok: true, operator: false };
  }

  if (opts.strict) {
    return {
      ok: false,
      status: configuredKey ? 401 : 503,
      error: configuredKey
        ? 'Operator credentials required.'
        : 'This action is disabled: OPERATOR_API_KEY is not configured.',
      operator: false,
    };
  }

  const sandbox = (env.PAYPAL_ENVIRONMENT || 'SANDBOX').toUpperCase() === 'SANDBOX';
  if (env.ALLOW_PUBLIC_DEMO_WRITES === 'true' && sandbox && isSameOrigin(req)) {
    return { ok: true, operator: false };
  }

  return {
    ok: false,
    status: configuredKey ? 401 : 503,
    error: configuredKey
      ? 'Operator credentials required.'
      : 'Mutating endpoints are disabled: set OPERATOR_API_KEY (or ALLOW_PUBLIC_DEMO_WRITES=true for a sandbox demo).',
    operator: false,
  };
}

/** Convenience wrapper: returns a ready-made JSON Response when access is denied, else null. */
export function denyUnlessAuthorized(req: Request, opts: { strict?: boolean } = {}): Response | null {
  const result = checkOperatorAccess(req, opts);
  if (result.ok) return null;
  return Response.json({ error: result.error }, { status: result.status ?? 403 });
}

/** Maximum JSON body size helper. Returns a 413 Response when Content-Length exceeds the limit. */
export function rejectOversizedBody(req: Request, maxBytes: number): Response | null {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(len) && len > maxBytes) {
    return Response.json({ error: 'Request body too large.' }, { status: 413 });
  }
  return null;
}

/** Never return upstream/internal error text to clients. */
export function genericError(status = 500, message = 'Internal error'): Response {
  return Response.json({ error: message }, { status });
}
