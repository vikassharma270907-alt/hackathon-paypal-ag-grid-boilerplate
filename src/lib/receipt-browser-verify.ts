/**
 * Browser-side Ed25519 receipt verification using WebCrypto. No server round-trip, so a judge can
 * check a receipt with nothing but the public key. Mirrors verifyReceiptEd25519() in receipt-ed25519.ts.
 */
import { canonicalJson } from './canonical-json';

export interface BrowserReceipt {
  payload: Record<string, unknown>;
  algorithm: string;
  signature: string; // base64
  payloadSha256: string; // hex
  signedAt: string;
}

export type BrowserVerifyResult =
  | { status: 'valid' }
  | { status: 'invalid'; reason: string }
  | { status: 'unsupported'; reason: string };

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyReceiptInBrowser(
  receipt: BrowserReceipt,
  publicKeyPem: string
): Promise<BrowserVerifyResult> {
  if (receipt?.algorithm !== 'Ed25519') return { status: 'invalid', reason: 'Unsupported algorithm' };
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return { status: 'unsupported', reason: 'WebCrypto is not available in this context (needs HTTPS or localhost).' };
  }
  try {
    const canonical = canonicalJson(receipt.payload);
    const digest = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
    if (digest !== receipt.payloadSha256) {
      return { status: 'invalid', reason: 'Payload digest mismatch: the receipt contents were modified.' };
    }

    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey('spki', pemToDer(publicKeyPem) as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    } catch {
      return { status: 'unsupported', reason: 'This browser does not support Ed25519 in WebCrypto. Use a current Chrome, Edge, Firefox or Safari.' };
    }

    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      b64ToBytes(receipt.signature) as BufferSource,
      new TextEncoder().encode(`${receipt.signedAt}\n${canonical}`) as BufferSource
    );
    return ok
      ? { status: 'valid' }
      : { status: 'invalid', reason: 'Signature mismatch: modified, or signed by a different key.' };
  } catch {
    return { status: 'invalid', reason: 'Malformed receipt or public key.' };
  }
}
