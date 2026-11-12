/**
 * Fixed-window, per-key rate limiter (in-memory, per server instance).
 *
 * Good enough to stop a single client from draining the AI / PayPal quota on a demo deployment.
 * It is not shared across instances; a multi-instance deployment needs a shared store (Redis etc.).
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000
  ) {}

  check(key: string, now = Date.now()): RateLimitResult {
    let entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      entry = { count: 0, windowStart: now };
    }
    entry.count += 1;
    // Re-insert to keep Map order roughly LRU, then evict the oldest keys if over capacity.
    this.hits.delete(key);
    this.hits.set(key, entry);
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }

    const allowed = entry.count <= this.limit;
    return {
      allowed,
      remaining: Math.max(0, this.limit - entry.count),
      retryAfterSeconds: allowed ? 0 : Math.ceil((entry.windowStart + this.windowMs - now) / 1000),
    };
  }
}

/** Best-effort client key. Behind a proxy (Render) the first X-Forwarded-For hop is the client. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim() || 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}
