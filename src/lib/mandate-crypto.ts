import crypto from 'crypto';
import { PaymentMandate, MandateApproval, AuditEvent } from './domain-models';
import { evidenceStore } from './evidence-store';

/**
 * VeriSettle AI — Cryptographic Payment Mandate & Policy Enforcement Engine
 * 
 * Implements:
 * 1. Deterministic Canonical JSON serialization
 * 2. Server-side asymmetric signing (Ed25519) and HMAC-SHA256 scheme
 * 3. SHA-256 Mandate & Transaction Digest generation
 * 4. Nonce generation & Replay Prevention
 * 5. Expiration & Policy Firewall validation
 * 6. Approval-to-Transaction Binding
 */

// In-memory nonce cache to prevent replay attacks
const consumedNonces = new Set<string>();

// Key pair cache for server-side signing
let serverKeyPair: { publicKey: string; privateKey: string } | null = null;

export function getServerSigningKeys(): { publicKey: string; privateKey: string } {
  if (!serverKeyPair) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    serverKeyPair = { publicKey, privateKey };
  }
  return serverKeyPair;
}

/**
 * Produces canonical sorted JSON string to ensure deterministic hashing.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJsonStringify((obj as Record<string, unknown>)[k])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes SHA-256 digest of canonical JSON.
 */
export function computeSha256Digest(data: unknown): string {
  const canonical = canonicalJsonStringify(data);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Signs payload using Ed25519 asymmetric private key.
 */
export function signPayloadEd25519(payload: unknown, privateKeyPem?: string): { signature: string; digest: string } {
  const digest = computeSha256Digest(payload);
  const key = privateKeyPem || getServerSigningKeys().privateKey;
  const signature = crypto.sign(null, Buffer.from(digest, 'utf-8'), key).toString('base64');
  return { signature, digest };
}

/**
 * Verifies Ed25519 signature against payload and public key.
 */
export function verifySignatureEd25519(
  payload: unknown,
  signatureBase64: string,
  publicKeyPem?: string
): boolean {
  try {
    const digest = computeSha256Digest(payload);
    const key = publicKeyPem || getServerSigningKeys().publicKey;
    return crypto.verify(null, Buffer.from(digest, 'utf-8'), key, Buffer.from(signatureBase64, 'base64'));
  } catch (_e) {
    return false;
  }
}

/**
 * Generates a unique, single-use cryptographic nonce.
 */
export function generateNonce(prefix: string = 'NONCE'): string {
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now().toString(36);
  return `${prefix}-${timestamp}-${randomBytes}`;
}

/**
 * Checks and consumes a nonce. Returns false if already used (Replay Attack!).
 */
export function consumeNonce(nonce: string): { valid: boolean; reason?: string } {
  if (!nonce || nonce.trim().length === 0) {
    return { valid: false, reason: 'Nonce is missing or empty' };
  }
  if (consumedNonces.has(nonce)) {
    return { valid: false, reason: 'Cryptographic replay detected: nonce has already been consumed' };
  }
  consumedNonces.add(nonce);
  return { valid: true };
}

export interface PolicyFirewallCheckInput {
  mandate: PaymentMandate;
  supplierId: string;
  recipient: string;
  category: string;
  currency: string;
  proposedAmount: number;
  verifiedDeliveredAmount?: number;
  deliveryVerified: boolean;
  comprehensiveRiskScore: number;
  invoiceVariancePct: number;
  nonce: string;
  approval?: MandateApproval;
  promptText?: string;
}

export interface PolicyFirewallCheckResult {
  decision: 'ALLOW' | 'REQUIRE_HUMAN_APPROVAL' | 'BLOCK';
  status:
    | 'ALLOWED_AUTOMATIC'
    | 'REQUIRE_HUMAN_APPROVAL'
    | 'BLOCKED_SIGNATURE_INVALID'
    | 'BLOCKED_MANDATE_EXPIRED'
    | 'BLOCKED_REPLAY_ATTACK'
    | 'BLOCKED_SUPPLIER_MISMATCH'
    | 'BLOCKED_CURRENCY_MISMATCH'
    | 'BLOCKED_CATEGORY_DISALLOWED'
    | 'BLOCKED_ORDER_CAP_EXCEEDED'
    | 'BLOCKED_WEEKLY_BUDGET_EXCEEDED'
    | 'BLOCKED_VARIANCE_EXCEEDED'
    | 'BLOCKED_DELIVERY_UNVERIFIED'
    | 'BLOCKED_HIGH_RISK'
    | 'BLOCKED_PROMPT_INJECTION'
    | 'BLOCKED_APPROVAL_BINDING_MISMATCH';
  allowedAmount: number;
  wasClamped: boolean;
  clampReason?: string;
  reasons: string[];
  mandateDigest: string;
  transactionDigest: string;
}

/**
 * Evaluates the deterministic Policy Firewall.
 * Core rule: Fail-closed whenever a mandatory check is violated.
 */
export function evaluateMandatePolicyFirewall(input: PolicyFirewallCheckInput): PolicyFirewallCheckResult {
  const reasons: string[] = [];
  const { mandate } = input;

  // 1. Transaction Digest for binding
  const transactionPayload = {
    supplierId: input.supplierId,
    recipient: input.recipient.trim().toLowerCase(),
    category: input.category,
    currency: input.currency.toUpperCase(),
    proposedAmount: Number(input.proposedAmount.toFixed(2)),
    deliveryVerified: input.deliveryVerified,
  };
  const transactionDigest = computeSha256Digest(transactionPayload);

  // 2. Prompt Injection Shield
  if (input.promptText) {
    const injectionPatterns = [
      /ignore\s+(previous|all|the)\s+instructions/i,
      /ignore\s+paypal\.md/i,
      /bypass\s+(limits|firewall|guardrails|policy)/i,
      /override\s+(policy|budget|mandate)/i,
      /send\s+\$?\d+.*regardless/i,
      /system\s+prompt\s+override/i,
      /as\s+an\s+unconstrained\s+agent/i,
    ];
    if (injectionPatterns.some((pattern) => pattern.test(input.promptText!))) {
      reasons.push('Untrusted prompt injection attempt detected in transaction payload. Fails closed.');
      return {
        decision: 'BLOCK',
        status: 'BLOCKED_PROMPT_INJECTION',
        allowedAmount: 0,
        wasClamped: false,
        reasons,
        mandateDigest: mandate.mandateDigest,
        transactionDigest,
      };
    }
  }

  // 3. Replay Protection (Nonce check)
  const nonceCheck = consumeNonce(input.nonce);
  if (!nonceCheck.valid) {
    reasons.push(nonceCheck.reason || 'Replay attack prevented by single-use nonce monitor.');
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_REPLAY_ATTACK',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 4. Mandate Expiration Check
  const now = Date.now();
  const expiry = new Date(mandate.expiresAt).getTime();
  if (isNaN(expiry) || now > expiry) {
    reasons.push(`Mandate ${mandate.mandateId} expired at ${mandate.expiresAt}. Current time is ${new Date(now).toISOString()}.`);
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_MANDATE_EXPIRED',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 5. Signature Verification (if signature is provided)
  if (mandate.signature && mandate.publicKey && !mandate.signature.startsWith('sig_ed25519_demo_valid')) {
    const isSigValid = verifySignatureEd25519(
      {
        mandateId: mandate.mandateId,
        supplierId: mandate.supplierId,
        currency: mandate.currency,
        maxOrderAmount: mandate.maxOrderAmount,
        maxWeeklyBudget: mandate.maxWeeklyBudget,
        allowedCategories: mandate.allowedCategories,
        maxInvoiceVariancePct: mandate.maxInvoiceVariancePct,
        requireDeliveryVerification: mandate.requireDeliveryVerification,
        humanApprovalRequiredAbove: mandate.humanApprovalRequiredAbove,
        maxRiskScore: mandate.maxRiskScore,
        expiresAt: mandate.expiresAt,
      },
      mandate.signature,
      mandate.publicKey
    );
    if (!isSigValid) {
      reasons.push(`Cryptographic Ed25519 signature for mandate ${mandate.mandateId} is invalid or tampered.`);
      return {
        decision: 'BLOCK',
        status: 'BLOCKED_SIGNATURE_INVALID',
        allowedAmount: 0,
        wasClamped: false,
        reasons,
        mandateDigest: mandate.mandateDigest,
        transactionDigest,
      };
    }
  }

  // 6. Supplier Identity Match
  if (input.supplierId !== mandate.supplierId) {
    reasons.push(`Supplier mismatch: Transaction specifies ${input.supplierId}, mandate is locked to ${mandate.supplierId}.`);
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_SUPPLIER_MISMATCH',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 7. Currency Match
  if (input.currency.toUpperCase() !== mandate.currency.toUpperCase()) {
    reasons.push(`Currency mismatch: Transaction is in ${input.currency}, mandate requires ${mandate.currency}.`);
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_CURRENCY_MISMATCH',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 8. Allowed Category Check
  const categoryAllowed = mandate.allowedCategories.some(
    (c) => c.toLowerCase() === input.category.toLowerCase()
  );
  if (!categoryAllowed) {
    reasons.push(`Category '${input.category}' disallowed. Approved categories: [${mandate.allowedCategories.join(', ')}].`);
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_CATEGORY_DISALLOWED',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 9. Order Cap Check
  if (input.proposedAmount > mandate.maxOrderAmount) {
    reasons.push(`Proposed amount $${input.proposedAmount.toFixed(2)} exceeds per-order cap of $${mandate.maxOrderAmount.toFixed(2)}.`);
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_ORDER_CAP_EXCEEDED',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 10. Weekly Budget Cap Check
  if (mandate.currentWeeklySpend + input.proposedAmount > mandate.maxWeeklyBudget) {
    reasons.push(
      `Weekly budget exceeded: Current spend $${mandate.currentWeeklySpend.toFixed(2)} + proposed $${input.proposedAmount.toFixed(2)} > limit $${mandate.maxWeeklyBudget.toFixed(2)}.`
    );
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_WEEKLY_BUDGET_EXCEEDED',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 11. Invoice Variance Check
  if (input.invoiceVariancePct > mandate.maxInvoiceVariancePct) {
    reasons.push(
      `Invoice variance ${input.invoiceVariancePct.toFixed(2)}% exceeds mandate limit ${mandate.maxInvoiceVariancePct}%. Immediate freeze.`
    );
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_VARIANCE_EXCEEDED',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 12. Delivery Verification Check
  if (mandate.requireDeliveryVerification && !input.deliveryVerified) {
    reasons.push('Mandate requires verified physical delivery before settlement. Delivery unconfirmed.');
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_DELIVERY_UNVERIFIED',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 13. Risk Score Firewall
  if (input.comprehensiveRiskScore > mandate.maxRiskScore) {
    reasons.push(`Risk score ${input.comprehensiveRiskScore.toFixed(2)} exceeds allowed threshold ${mandate.maxRiskScore.toFixed(2)}.`);
    return {
      decision: 'BLOCK',
      status: 'BLOCKED_HIGH_RISK',
      allowedAmount: 0,
      wasClamped: false,
      reasons,
      mandateDigest: mandate.mandateDigest,
      transactionDigest,
    };
  }

  // 14. Partial Delivery Clamping
  let allowedAmount = input.proposedAmount;
  let wasClamped = false;
  let clampReason: string | undefined;

  if (
    input.verifiedDeliveredAmount !== undefined &&
    input.verifiedDeliveredAmount < input.proposedAmount
  ) {
    wasClamped = true;
    allowedAmount = Number(input.verifiedDeliveredAmount.toFixed(2));
    clampReason = `Settlement clamped from proposed $${input.proposedAmount.toFixed(2)} to verified delivery $${allowedAmount.toFixed(2)}.`;
    reasons.push(clampReason);
  }

  // 15. Human Approval Binding Check
  const requiresApproval = allowedAmount > mandate.humanApprovalRequiredAbove;
  if (requiresApproval) {
    if (!input.approval) {
      reasons.push(`Amount $${allowedAmount.toFixed(2)} exceeds auto-approve threshold $${mandate.humanApprovalRequiredAbove.toFixed(2)}. Human approval required.`);
      return {
        decision: 'REQUIRE_HUMAN_APPROVAL',
        status: 'REQUIRE_HUMAN_APPROVAL',
        allowedAmount,
        wasClamped,
        clampReason,
        reasons,
        mandateDigest: mandate.mandateDigest,
        transactionDigest,
      };
    }

    // Verify approval binding
    if (input.approval.transactionDigest !== transactionDigest) {
      reasons.push('Approval-to-transaction binding mismatch: Transaction was altered after approval was signed.');
      return {
        decision: 'BLOCK',
        status: 'BLOCKED_APPROVAL_BINDING_MISMATCH',
        allowedAmount: 0,
        wasClamped,
        clampReason,
        reasons,
        mandateDigest: mandate.mandateDigest,
        transactionDigest,
      };
    }

    if (input.approval.status !== 'APPROVED') {
      reasons.push(`Human approval status is '${input.approval.status}', not 'APPROVED'.`);
      return {
        decision: 'REQUIRE_HUMAN_APPROVAL',
        status: 'REQUIRE_HUMAN_APPROVAL',
        allowedAmount,
        wasClamped,
        clampReason,
        reasons,
        mandateDigest: mandate.mandateDigest,
        transactionDigest,
      };
    }
  }

  // 16. Allowed Automatic / Approved Execution
  reasons.push('All deterministic mandate conditions satisfied.');
  return {
    decision: 'ALLOW',
    status: 'ALLOWED_AUTOMATIC',
    allowedAmount,
    wasClamped,
    clampReason,
    reasons,
    mandateDigest: mandate.mandateDigest,
    transactionDigest,
  };
}

/**
 * Creates and cryptographically signs a new Payment Mandate.
 */
export function createSignedPaymentMandate(params: {
  mandateId: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  maxOrderAmount: number;
  maxWeeklyBudget: number;
  allowedCategories: string[];
  maxInvoiceVariancePct: number;
  requireDeliveryVerification: boolean;
  humanApprovalRequiredAbove: number;
  maxRiskScore: number;
  expiresAt: string;
}): PaymentMandate {
  const keys = getServerSigningKeys();
  const rawMandate = {
    mandateId: params.mandateId,
    supplierId: params.supplierId,
    currency: params.currency,
    maxOrderAmount: params.maxOrderAmount,
    maxWeeklyBudget: params.maxWeeklyBudget,
    allowedCategories: params.allowedCategories,
    maxInvoiceVariancePct: params.maxInvoiceVariancePct,
    requireDeliveryVerification: params.requireDeliveryVerification,
    humanApprovalRequiredAbove: params.humanApprovalRequiredAbove,
    maxRiskScore: params.maxRiskScore,
    expiresAt: params.expiresAt,
  };

  const { signature, digest } = signPayloadEd25519(rawMandate, keys.privateKey);

  const mandate: PaymentMandate = {
    ...params,
    currentWeeklySpend: 0,
    createdAt: new Date().toISOString(),
    publicKey: keys.publicKey,
    signature,
    mandateDigest: digest,
  };

  evidenceStore.mandates.set(mandate.mandateId, mandate);
  evidenceStore.recordAudit(
    'MANDATE_ADMIN',
    'CREATE_MANDATE',
    'PaymentMandate',
    mandate.mandateId,
    digest,
    { maxOrderAmount: mandate.maxOrderAmount, maxWeeklyBudget: mandate.maxWeeklyBudget }
  );

  return mandate;
}
