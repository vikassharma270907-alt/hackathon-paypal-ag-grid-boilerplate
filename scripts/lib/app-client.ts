/**
 * Tiny HTTP client for the RestockPilot API, shared by scripts/smoke.ts and scripts/sandbox-verify.ts.
 * Sends a same-origin Origin header (required by the API guard) and an optional operator key.
 * Never logs the operator key.
 */
export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  ok: boolean;
  body: T;
}

export class AppClient {
  constructor(
    readonly baseUrl: string,
    private readonly operatorKey?: string
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', Origin: this.baseUrl };
    if (this.operatorKey) h['x-operator-key'] = this.operatorKey;
    return h;
  }

  async get<T = Record<string, unknown>>(path: string): Promise<ApiResult<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers(), signal: AbortSignal.timeout(30_000) });
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, ok: res.ok, body };
  }

  async restock<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<ApiResult<T>> {
    return this.post<T>('/api/restock', payload);
  }

  async post<T = Record<string, unknown>>(path: string, payload: Record<string, unknown>): Promise<ApiResult<T>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => ({}))) as T;
    return { status: res.status, ok: res.ok, body };
  }
}

export function baseUrlFromArgs(argv: string[], fallback = 'http://localhost:3000'): string {
  const flag = argv.find((a) => a.startsWith('--base-url='));
  const raw = flag?.slice('--base-url='.length) || process.env.SMOKE_BASE_URL || fallback;
  return raw.replace(/\/+$/, '');
}
