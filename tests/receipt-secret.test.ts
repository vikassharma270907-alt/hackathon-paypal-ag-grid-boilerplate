import { describe, it, expect } from 'vitest';
import { getReceiptSigningSecret } from '@/lib/receipt-secret';

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe('receipt signing secret (fail closed in production)', () => {
  it('uses the configured secret when present', () => {
    expect(getReceiptSigningSecret(env({ NODE_ENV: 'production', RECEIPT_SIGNING_SECRET: 's3cret' }))).toBe('s3cret');
  });

  it('refuses the public fallback key in a production runtime', () => {
    expect(() => getReceiptSigningSecret(env({ NODE_ENV: 'production' }))).toThrow(/RECEIPT_SIGNING_SECRET/);
  });

  it('does not throw during the production build phase', () => {
    expect(() =>
      getReceiptSigningSecret(env({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' }))
    ).not.toThrow();
  });

  it('allows the fallback only with explicit demo opt-in or outside production', () => {
    expect(() =>
      getReceiptSigningSecret(env({ NODE_ENV: 'production', ALLOW_INSECURE_DEMO_RECEIPT_KEY: 'true' }))
    ).not.toThrow();
    expect(() => getReceiptSigningSecret(env({ NODE_ENV: 'development' }))).not.toThrow();
  });
});
