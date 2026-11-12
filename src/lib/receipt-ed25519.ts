/**
 * Publicly verifiable docket receipts (Ed25519).
 *
 * HMAC receipts (receipt-verifier.ts) can only be checked by the server. Ed25519 lets ANYONE with
 * the public key verify that the docket (lines, totals, policy decision, contract hash) was not
 * altered after approval. The key is derived deterministically from RECEIPT_SIGNING_SECRET so all
 * server instances sign with the same key; set a strong secret for any real deployment.
 */
import crypto from 'node:crypto';
import { canonicalJson } from './canonical-json';

import { getReceiptSigningSecret } from './receipt-secret';
// PKCS#8 prefix for an Ed25519 private key; the 32-byte seed follows.
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

let cachedKeyPair: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject } | undefined;

function keyPair() {
  if (cachedKeyPair) return cachedKeyPair;
  // HKDF (not a bare hash) derives the 32-byte seed from the secret.
  const seed = Buffer.from(
    crypto.hkdfSync('sha256', getReceiptSigningSecret(), 'restockpilot-receipts', 'ed25519-signing-key', 32)
  );
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKey = crypto.createPublicKey(privateKey);
  cachedKeyPair = { privateKey, publicKey };
  return cachedKeyPair;
}

export function getReceiptPublicKeyPem(): string {
  return keyPair().publicKey.export({ type: 'spki', format: 'pem' }).toString();
}

// Shared with the browser verifier (/verify) so signer and verifier hash identical bytes.
export { canonicalJson };

function signingInput(canonicalPayload: string, signedAt: string): string {
  return `${signedAt}\n${canonicalPayload}`;
}

export interface Ed25519Receipt<T extends object = Record<string, unknown>> {
  payload: T;
  algorithm: 'Ed25519';
  signature: string; // base64
  payloadSha256: string; // hex
  signedAt: string;
}

export function signReceiptEd25519<T extends object>(payload: T): Ed25519Receipt<T> {
  const canonical = canonicalJson(payload);
  const signedAt = new Date().toISOString();
  // signedAt is inside the signed bytes so it cannot be edited after signing.
  const signature = crypto
    .sign(null, Buffer.from(signingInput(canonical, signedAt)), keyPair().privateKey)
    .toString('base64');
  return {
    payload,
    algorithm: 'Ed25519',
    signature,
    payloadSha256: crypto.createHash('sha256').update(canonical).digest('hex'),
    signedAt,
  };
}

/** Verify using only a public key (defaults to this server's key). */
export function verifyReceiptEd25519(
  receipt: Ed25519Receipt,
  publicKeyPem: string = getReceiptPublicKeyPem()
): { valid: boolean; reason?: string } {
  if (receipt?.algorithm !== 'Ed25519') return { valid: false, reason: 'Unsupported algorithm' };
  try {
    const canonical = canonicalJson(receipt.payload);
    const digest = crypto.createHash('sha256').update(canonical).digest('hex');
    if (digest !== receipt.payloadSha256) {
      return { valid: false, reason: 'Payload digest mismatch: receipt was modified' };
    }
    const ok = crypto.verify(
      null,
      Buffer.from(signingInput(canonical, receipt.signedAt)),
      crypto.createPublicKey(publicKeyPem),
      Buffer.from(receipt.signature, 'base64')
    );
    return ok ? { valid: true } : { valid: false, reason: 'Signature mismatch: receipt was modified or signed by another key' };
  } catch {
    return { valid: false, reason: 'Malformed receipt or key' };
  }
}
