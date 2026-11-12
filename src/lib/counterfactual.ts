/**
 * Counterfactual explainer for the policy gate (pure, deterministic, zero I/O).
 *
 * "Why was this blocked, and what is the smallest change that would make it ALLOW?"
 * Every suggestion is derived from the same mandate numbers the gate uses. Quantity suggestions are
 * RE-EVALUATED through evaluateMandate(), so the explainer can never promise an outcome the gate
 * would not actually produce. It only ever explains; it never changes a decision.
 */
import {
  evaluateMandate,
  type CandidateOffer,
  type Mandate,
  type PolicyDecision,
  type PolicyEvaluationResult,
} from './policy';

export type FixOwner = 'AGENT' | 'OWNER' | 'NONE';

export interface CounterfactualItem {
  rule: string;
  severity: 'BLOCK' | 'ASK';
  /** Who could resolve it: the agent (e.g. smaller quantity), the owner (policy change/approval), or nobody (pick another offer). */
  fixableBy: FixOwner;
  suggestion: string;
}

export interface VerifiedAlternative {
  qty: number;
  total: number;
  decision: PolicyDecision;
  note: string;
}

export interface CounterfactualResult {
  decision: PolicyDecision;
  items: CounterfactualItem[];
  /** Largest quantity that still re-evaluates to a better decision, proven by re-running the gate. */
  verifiedAlternative: VerifiedAlternative | null;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function explainCounterfactuals(
  mandate: Mandate,
  spendSoFar: number,
  offer: CandidateOffer,
  verifiedMedianPrice: number,
  now: Date | string = new Date()
): CounterfactualResult {
  const base: PolicyEvaluationResult = evaluateMandate(mandate, spendSoFar, offer, verifiedMedianPrice, now);
  const items: CounterfactualItem[] = [];
  const unit = offer.unitPrice;
  const pack = Math.max(1, offer.packSize || 1);
  const currentDate = typeof now === 'string' ? new Date(now) : now;

  if (!mandate.active) {
    items.push({
      rule: 'Rule 1: Mandate active',
      severity: 'BLOCK',
      fixableBy: 'OWNER',
      suggestion: 'Only the owner can re-activate the mandate. The agent cannot.',
    });
  } else if (currentDate.getTime() > new Date(mandate.expiresAt).getTime()) {
    items.push({
      rule: 'Rule 1: Mandate unexpired',
      severity: 'BLOCK',
      fixableBy: 'OWNER',
      suggestion: `Mandate expired on ${mandate.expiresAt}. The owner must issue a new mandate.`,
    });
  }

  if (!mandate.allowedCategories.some((c) => c.toLowerCase() === offer.category.toLowerCase())) {
    items.push({
      rule: 'Rule 2: Category allowed',
      severity: 'BLOCK',
      fixableBy: 'OWNER',
      suggestion: `Category '${offer.category}' is outside the mandate. The owner would have to add it explicitly; text inside a listing can never do that.`,
    });
  }

  if (offer.inStock !== true) {
    items.push({
      rule: 'Rule 3: In stock',
      severity: 'BLOCK',
      fixableBy: 'NONE',
      suggestion: 'Choose an in-stock offer from another merchant.',
    });
  }

  if (offer.sameProduct !== true) {
    items.push({
      rule: 'Rule 4: Same product and pack size',
      severity: 'BLOCK',
      fixableBy: 'NONE',
      suggestion: 'This is a different product or pack size. Choose a listing that matches the target SKU.',
    });
  }

  if (offer.condition !== 'new' && base.blockReasons.some((r) => r.startsWith('Item condition'))) {
    items.push({
      rule: 'Rule 7: Condition',
      severity: 'BLOCK',
      fixableBy: 'NONE',
      suggestion: `Condition is '${offer.condition}'. Consumables must be new; pick a new-condition listing.`,
    });
  } else if (offer.condition !== 'new' && base.askReasons.some((r) => r.startsWith('Item condition'))) {
    items.push({
      rule: 'Rule 7: Condition',
      severity: 'ASK',
      fixableBy: 'OWNER',
      suggestion: `Condition is '${offer.condition}'. The owner can accept it explicitly, or the agent can pick a new listing.`,
    });
  }

  if (verifiedMedianPrice > 0 && unit < 0.65 * verifiedMedianPrice) {
    const floor = Number((0.65 * verifiedMedianPrice).toFixed(2));
    items.push({
      rule: 'Rule 8: Price plausibility',
      severity: 'ASK',
      fixableBy: 'OWNER',
      suggestion: `Unit price ${usd(unit)} is below ${usd(floor)} (65% of the verified median ${usd(verifiedMedianPrice)}). A price in line with the median passes, or the owner confirms the listing is genuine.`,
    });
  }

  // Quantity-driven rules: compute the largest quantity that satisfies every cap.
  const qtyNow = unit > 0 ? Math.max(1, Math.round(offer.totalPrice / unit)) : 0;
  let verifiedAlternative: VerifiedAlternative | null = null;

  if (unit > 0) {
    const caps = {
      perOrder: Math.floor(mandate.maxPerOrder / unit),
      budget: Math.floor(Math.max(0, mandate.monthlyBudget - spendSoFar) / unit),
      askFirst: Math.floor(mandate.askFirstOver / unit),
    };

    if (offer.totalPrice > mandate.maxPerOrder) {
      items.push({
        rule: 'Rule 5: Per-order cap',
        severity: 'BLOCK',
        fixableBy: 'AGENT',
        suggestion: `Total ${usd(offer.totalPrice)} exceeds the ${usd(mandate.maxPerOrder)} cap. At ${usd(unit)} each, at most ${caps.perOrder} units fit.`,
      });
    }
    if (spendSoFar + offer.totalPrice > mandate.monthlyBudget) {
      items.push({
        rule: 'Rule 6: Monthly budget',
        severity: 'BLOCK',
        fixableBy: 'AGENT',
        suggestion: `Only ${usd(Math.max(0, mandate.monthlyBudget - spendSoFar))} of budget remains, which covers at most ${caps.budget} units at ${usd(unit)}.`,
      });
    }
    if (offer.totalPrice > mandate.askFirstOver) {
      items.push({
        rule: 'Rule 9: Auto-approval threshold',
        severity: 'ASK',
        fixableBy: 'OWNER',
        suggestion: `Orders over ${usd(mandate.askFirstOver)} need the owner. Up to ${caps.askFirst} units would clear the threshold on their own.`,
      });
    }

    // Prove the alternative by re-running the real gate at smaller quantities.
    if (qtyNow > 0 && base.decision !== 'ALLOW') {
      // Try the quantity that clears every cap first, then the one that only clears the hard caps.
      const candidates = [
        Math.min(caps.perOrder, caps.budget, caps.askFirst, qtyNow),
        Math.min(caps.perOrder, caps.budget, qtyNow),
      ];
      for (const c of candidates) {
        const q = Math.floor(c / pack) * pack;
        if (q < 1 || q >= qtyNow) continue;
        const total = Number((q * unit).toFixed(2));
        const re = evaluateMandate(mandate, spendSoFar, { ...offer, totalPrice: total }, verifiedMedianPrice, now);
        const better =
          (base.decision === 'BLOCK' && re.decision !== 'BLOCK') || (base.decision === 'ASK' && re.decision === 'ALLOW');
        if (better) {
          verifiedAlternative = {
            qty: q,
            total,
            decision: re.decision,
            note: `Re-running the gate at ${q} units (${usd(total)}) returns ${re.decision}.`,
          };
          break;
        }
      }
    }
  }

  return { decision: base.decision, items, verifiedAlternative };
}
