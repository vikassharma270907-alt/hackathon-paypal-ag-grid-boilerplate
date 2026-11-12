/**
 * RestockPilot Cryptographic Receipt Signature & Verification Engine
 * 
 * Implements FIPS 180-4 SHA-256 HMAC and canonical JSON fingerprinting for docket receipts.
 * Ensures that once an order and its policy checks are approved, the resulting docket receipt
 * is cryptographically sealed and tamper-evident.
 */

import crypto from 'node:crypto';

// Secret seed for signing docket receipts (deterministic fallback for sandbox & verification)
const RECEIPT_SIGNING_SECRET =
  process.env.RECEIPT_SIGNING_SECRET || 'restockpilot-hackathon-fips180-4-secret-key-2026';

/**
 * One-time security warning: the fallback signing key ships with the public source,
 * so anyone with this repository can forge receipt signatures. Acceptable for the
 * sandbox hackathon demo (transparent SIMULATED/SANDBOX mode only) — but a strong
 * secret must be set before any real deployment.
 */
if (!process.env.RECEIPT_SIGNING_SECRET && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  console.warn(
    '[receipt-verifier] RECEIPT_SIGNING_SECRET is not set — using the public fallback key from source. ' +
      'Receipt signatures are forgeable by anyone with this repository. ' +
      'Add RECEIPT_SIGNING_SECRET to .env.local before any real deployment.'
  );
}

export interface SignedDocketReceipt {
  receiptId: string;
  poId: string;
  sku: string;
  timestamp: string;
  orderTotal: number;
  approvedQty: number;
  unitPrice: number;
  verifiedMedianPrice: number;
  status: string;
  checksSummary: string[];
  contractHash: string;
  signature: string;
  algorithm: 'HMAC-SHA256';
  verifiedWithPayPal: boolean;
  paypalOrderId?: string;
  paypalCaptureId?: string;
}

/**
 * Canonically sorts object keys for deterministic JSON serialization
 */
function canonicalizeObject(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeObject).join(',') + ']';
  }
  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries = sortedKeys.map((key) => `${JSON.stringify(key)}:${canonicalizeObject(record[key])}`);
  return '{' + entries.join(',') + '}';
}

/**
 * Creates a cryptographically signed docket receipt
 */
export function signDocketReceipt(data: {
  poId: string;
  sku: string;
  orderTotal: number;
  approvedQty: number;
  unitPrice: number;
  verifiedMedianPrice: number;
  status: string;
  checksSummary: string[];
  contractHash: string;
  paypalOrderId?: string;
  paypalCaptureId?: string;
}): SignedDocketReceipt {
  const timestamp = new Date().toISOString();
  const receiptId = `RCPT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

  const payloadToSign = {
    receiptId,
    poId: data.poId,
    sku: data.sku,
    timestamp,
    orderTotal: data.orderTotal,
    approvedQty: data.approvedQty,
    unitPrice: data.unitPrice,
    verifiedMedianPrice: data.verifiedMedianPrice,
    status: data.status,
    checksSummary: data.checksSummary,
    contractHash: data.contractHash,
  };

  const canonicalPayload = canonicalizeObject(payloadToSign);
  const signature = crypto
    .createHmac('sha256', RECEIPT_SIGNING_SECRET)
    .update(canonicalPayload)
    .digest('hex');

  return {
    ...payloadToSign,
    signature,
    algorithm: 'HMAC-SHA256',
    verifiedWithPayPal: Boolean(data.paypalCaptureId || (data.paypalOrderId && data.status === 'CAPTURED')),
    paypalOrderId: data.paypalOrderId,
    paypalCaptureId: data.paypalCaptureId,
  };
}

/**
 * Verifies the cryptographic signature of a docket receipt.
 * Returns true if the receipt has not been tampered with.
 */
export function verifyDocketReceipt(receipt: SignedDocketReceipt): {
  valid: boolean;
  reason?: string;
  canonicalDigest?: string;
} {
  if (receipt.algorithm !== 'HMAC-SHA256') {
    return { valid: false, reason: `Unsupported signing algorithm '${receipt.algorithm}'` };
  }

  const payload = {
    receiptId: receipt.receiptId,
    poId: receipt.poId,
    sku: receipt.sku,
    timestamp: receipt.timestamp,
    orderTotal: receipt.orderTotal,
    approvedQty: receipt.approvedQty,
    unitPrice: receipt.unitPrice,
    verifiedMedianPrice: receipt.verifiedMedianPrice,
    status: receipt.status,
    checksSummary: receipt.checksSummary,
    contractHash: receipt.contractHash,
  };

  const canonicalPayload = canonicalizeObject(payload);
  const expectedSignature = crypto
    .createHmac('sha256', RECEIPT_SIGNING_SECRET)
    .update(canonicalPayload)
    .digest('hex');

  const canonicalDigest = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

  if (crypto.timingSafeEqual(Buffer.from(receipt.signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
    return { valid: true, canonicalDigest };
  }

  return { valid: false, reason: 'Signature mismatch: receipt payload has been modified or tampered with' };
}
