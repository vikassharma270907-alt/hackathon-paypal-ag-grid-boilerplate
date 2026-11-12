import { describe, it, expect } from 'vitest';
import { checkOperatorAccess } from '@/lib/api-guard';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const mk = (headers: Record<string, string> = {}) =>
  new Request('https://app.example.com/api/restock', { method: 'POST', headers: { host: 'app.example.com', ...headers } });

describe('api guard (fail closed)', () => {
  it('production without any config denies with 503', () => {
    const r = checkOperatorAccess(mk(), { env: env({ NODE_ENV: 'production' }) });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });

  it('accepts a valid operator key and rejects a wrong one', () => {
    const e = env({ NODE_ENV: 'production', OPERATOR_API_KEY: 'k-123' });
    expect(checkOperatorAccess(mk({ authorization: 'Bearer k-123' }), { env: e }).ok).toBe(true);
    expect(checkOperatorAccess(mk({ 'x-operator-key': 'k-123' }), { env: e }).operator).toBe(true);
    const bad = checkOperatorAccess(mk({ authorization: 'Bearer nope' }), { env: e });
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(401);
  });

  it('public demo writes need explicit opt-in, SANDBOX, and same-origin', () => {
    const base = { NODE_ENV: 'production', ALLOW_PUBLIC_DEMO_WRITES: 'true' };
    const same = mk({ origin: 'https://app.example.com' });
    expect(checkOperatorAccess(same, { env: env(base) }).ok).toBe(true);
    expect(checkOperatorAccess(mk({ origin: 'https://evil.example' }), { env: env(base) }).ok).toBe(false);
    expect(checkOperatorAccess(mk(), { env: env(base) }).ok).toBe(false); // no origin proof
    expect(checkOperatorAccess(same, { env: env({ ...base, PAYPAL_ENVIRONMENT: 'LIVE' }) }).ok).toBe(false);
  });

  it('strict actions never use the public demo path', () => {
    const e = env({ NODE_ENV: 'production', ALLOW_PUBLIC_DEMO_WRITES: 'true' });
    const r = checkOperatorAccess(mk({ origin: 'https://app.example.com' }), { env: e, strict: true });
    expect(r.ok).toBe(false);
  });

  it('non-production allows same-origin/no-origin but blocks cross-site browsers', () => {
    const e = env({ NODE_ENV: 'development' });
    expect(checkOperatorAccess(mk(), { env: e }).ok).toBe(true);
    expect(checkOperatorAccess(mk({ origin: 'https://app.example.com' }), { env: e }).ok).toBe(true);
    expect(checkOperatorAccess(mk({ origin: 'https://evil.example' }), { env: e }).ok).toBe(false);
  });
});
