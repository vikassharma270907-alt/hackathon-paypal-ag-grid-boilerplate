import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSessionToken,
  decodeSigned,
  encodeSigned,
  publicOrigin,
  readSessionToken,
  safeNext,
} from '../src/lib/auth';

const user = { id: 'guest:abcd', name: 'Guest', email: 'g@demo.local', provider: 'guest' as const };

function req(headers: Record<string, string>, origin = 'http://localhost:10000') {
  return { headers: new Headers(headers), nextUrl: { origin, protocol: new URL(origin).protocol } };
}

afterEach(() => vi.unstubAllEnvs());

describe('session tokens', () => {
  it('round-trips a signed session', () => {
    const token = createSessionToken(user, 60);
    expect(readSessionToken(token)).toMatchObject(user);
  });

  it('rejects a tampered payload', () => {
    const [, sig] = createSessionToken(user, 60).split('.');
    const forged = Buffer.from(JSON.stringify({ ...user, provider: 'google', exp: 9e9 })).toString('base64url');
    expect(readSessionToken(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects expired tokens and junk', () => {
    expect(decodeSigned(encodeSigned({ exp: Math.floor(Date.now() / 1000) - 5 }))).toBeNull();
    expect(readSessionToken('not-a-token')).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });

  it('in production without AUTH_SECRET derives a key from OPERATOR_API_KEY', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', '');
    vi.stubEnv('OPERATOR_API_KEY', 'operator-key-0123456789abcdef');
    expect(readSessionToken(createSessionToken(user, 60))).toMatchObject(user);
  });

  it('in production with no secret at all fails closed instead of throwing on read', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', '');
    vi.stubEnv('OPERATOR_API_KEY', '');
    expect(readSessionToken('abc.def')).toBeNull();
    expect(() => createSessionToken(user, 60)).toThrow(/AUTH_SECRET/);
  });
});

describe('safeNext', () => {
  it('allows same-site relative paths only', () => {
    expect(safeNext('/proofline')).toBe('/proofline');
    expect(safeNext('//evil.example')).toBe('/dashboard');
    expect(safeNext('https://evil.example')).toBe('/dashboard');
    expect(safeNext('/\\evil.example')).toBe('/dashboard');
    expect(safeNext(null)).toBe('/dashboard');
  });
});

describe('publicOrigin', () => {
  it('uses forwarded host/proto behind a proxy', () => {
    expect(publicOrigin(req({ 'x-forwarded-host': 'app.example.com', 'x-forwarded-proto': 'https' }))).toBe(
      'https://app.example.com'
    );
  });

  it('falls back to the Host header, then to nextUrl.origin for invalid hosts', () => {
    expect(publicOrigin(req({ host: 'localhost:3000' }, 'http://localhost:3000'))).toBe('http://localhost:3000');
    expect(publicOrigin(req({ host: 'evil.com/path' }))).toBe('http://localhost:10000');
  });

  it('prefers APP_BASE_URL when configured', () => {
    vi.stubEnv('APP_BASE_URL', 'https://verisettle.example/');
    expect(publicOrigin(req({ host: 'other.example' }))).toBe('https://verisettle.example');
  });
});
