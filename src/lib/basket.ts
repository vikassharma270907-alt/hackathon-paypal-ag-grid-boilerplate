/**
 * Basket = ONE PayPal authorization that holds the money for several purchase-order lines.
 * The café owner then approves LINE BY LINE; only approved lines are captured (final_capture: true),
 * and PayPal releases the rest of the hold. Pure, deterministic helpers live here (no I/O) so the money
 * rules are unit-testable. The PayPal calls live in paypal-basket.ts.
 */
import crypto from 'node:crypto';
import type { Mandate, PolicyDecision } from './policy';

export type BasketStatus =
  | 'ORDER_CREATING'
  | 'AWAITING_BUYER_APPROVAL'
  | 'AUTHORIZED'
  | 'SETTLING'
  | 'SETTLED'
  | 'VOIDED'
  | 'UNKNOWN'
  | 'FAILED';

export interface BasketLine {
  poId: string;
  sku: string;
  name: string;
  qty: number;
  unitPriceCents: number;
  lineCents: number;
  decision: PolicyDecision;
}

export interface BasketReadBack {
  source: 'PAYPAL_GET' | 'SIMULATED';
  status: string;
  amountCents: number | null;
  customIdMatches: boolean | null;
  matches: boolean;
  checkedAt: string;
}

export interface Basket {
  id: string;
  mandateId: string;
  lines: BasketLine[];
  totalCents: number;
  /** sha256 over canonical lines + mandate; written into PayPal custom_id before the buyer approves. */
  contractHash: string;
  status: BasketStatus;
  mode: 'SANDBOX' | 'SIMULATED';
  paypalOrderId?: string;
  approveUrl?: string;
  authorizationId?: string;
  captureId?: string;
  paypalFee?: string;
  approvedPoIds: string[];
  releasedPoIds: string[];
  capturedCents: number;
  releasedCents: number;
  requestIds: { create: string; authorize?: string; capture?: string; void?: string };
  readBack?: BasketReadBack;
  receipt?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export const toCents = (usd: number): number => Math.round(usd * 100);
export const centsToUsd = (cents: number): string => (cents / 100).toFixed(2);

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Canonical, order-independent hash of exactly what the owner is being asked to authorize. */
export function basketContractHash(mandateId: string, lines: BasketLine[]): string {
  const canonical = [...lines]
    .sort((a, b) => a.poId.localeCompare(b.poId))
    .map((l) => [l.poId, l.sku, l.qty, l.unitPriceCents, l.lineCents].join('|'))
    .join(';');
  return sha256Hex(`${mandateId}#${canonical}`);
}

export interface SettlementPlan {
  action: 'CAPTURE' | 'VOID';
  captured: BasketLine[];
  released: BasketLine[];
  captureCents: number;
  releaseCents: number;
  /** Always true for a partial capture: PayPal then releases the uncaptured remainder of the hold. */
  finalCapture: true;
}

/** Which lines get money and which are released. Unknown ids are rejected by validateSettlement. */
export function computeSettlement(lines: BasketLine[], approvedPoIds: string[]): SettlementPlan {
  const approved = new Set(approvedPoIds);
  const captured = lines.filter((l) => approved.has(l.poId));
  const released = lines.filter((l) => !approved.has(l.poId));
  const captureCents = captured.reduce((s, l) => s + l.lineCents, 0);
  const releaseCents = released.reduce((s, l) => s + l.lineCents, 0);
  return {
    action: captured.length === 0 ? 'VOID' : 'CAPTURE',
    captured,
    released,
    captureCents,
    releaseCents,
    finalCapture: true,
  };
}

/** Server-side re-check before any money is captured. Returns a list of violations (empty = OK). */
export function validateSettlement(
  basket: Pick<Basket, 'mandateId' | 'lines' | 'contractHash' | 'totalCents'>,
  approvedPoIds: string[],
  mandate: Mandate,
  spendSoFarUsd: number,
): string[] {
  const errors: string[] = [];
  const known = new Set(basket.lines.map((l) => l.poId));
  for (const id of approvedPoIds) {
    if (!known.has(id)) errors.push(`Approved line ${id} is not part of this authorization`);
  }
  if (new Set(approvedPoIds).size !== approvedPoIds.length) errors.push('Duplicate approved line ids');

  if (basketContractHash(basket.mandateId, basket.lines) !== basket.contractHash) {
    errors.push('Contract hash mismatch: basket lines changed after the hold was requested');
  }
  const plan = computeSettlement(basket.lines, approvedPoIds);
  if (plan.captureCents + plan.releaseCents !== basket.totalCents) {
    errors.push('Captured + released does not equal the authorized total');
  }
  for (const l of plan.captured) {
    if (l.decision === 'BLOCK') errors.push(`${l.poId} is BLOCKed by mandate policy and cannot be captured`);
    if (l.lineCents / 100 > mandate.maxPerOrder) errors.push(`${l.poId} exceeds the per-order cap`);
  }
  if (spendSoFarUsd + plan.captureCents / 100 > mandate.monthlyBudget + 1e-9) {
    errors.push('Capture would exceed the monthly budget');
  }
  return errors;
}
