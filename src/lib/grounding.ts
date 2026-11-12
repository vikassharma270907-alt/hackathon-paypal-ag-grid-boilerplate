/**
 * Grounding check for AI output (pure, zero I/O).
 *
 * The model may only explain offers that were actually sourced this run. Any offer id, merchant
 * name, price or quoted evidence that cannot be traced back to the tool results is a violation,
 * and the caller must discard the AI text and use the deterministic template instead.
 */
import type { CandidateOffer } from '@/lib/policy';

export interface GroundableRanking {
  bestOfferId: string;
  summary: string;
  rankedOffers: Array<{
    offerId: string;
    reasoning: string;
    quotedEvidence: string;
  }>;
}

export interface GroundingResult {
  grounded: boolean;
  violations: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** All `$12.34`-style amounts in a string, as numbers. */
export function extractDollarAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g)) {
    out.push(Number(`${m[1].replace(/,/g, '')}${m[2] ? `.${m[2]}` : ''}`));
  }
  return out;
}

export function groundRanking(ranking: GroundableRanking, offers: CandidateOffer[]): GroundingResult {
  const violations: string[] = [];
  const byId = new Map(offers.map((o) => [o.id, o]));

  if (!byId.has(ranking.bestOfferId)) {
    violations.push(`bestOfferId '${ranking.bestOfferId}' was not in this run's sourced offers`);
  }

  const knownPrices = new Set<number>();
  for (const o of offers) {
    knownPrices.add(Number(o.unitPrice.toFixed(2)));
    knownPrices.add(Number(o.totalPrice.toFixed(2)));
  }
  const knownMerchants = offers.map((o) => norm(o.merchantName));

  for (const r of ranking.rankedOffers) {
    const offer = byId.get(r.offerId);
    if (!offer) {
      violations.push(`ranked offerId '${r.offerId}' was not sourced this run`);
      continue;
    }
    if (!norm(offer.title).includes(norm(r.quotedEvidence))) {
      violations.push(`quotedEvidence for ${r.offerId} is not a substring of the listing title`);
    }
  }

  const texts = [ranking.summary, ...ranking.rankedOffers.map((r) => r.reasoning)];
  for (const t of texts) {
    for (const amt of extractDollarAmounts(t)) {
      if (!knownPrices.has(Number(amt.toFixed(2)))) {
        violations.push(`price $${amt.toFixed(2)} does not appear in any sourced offer`);
      }
    }
  }

  // Any claimed "from <Merchant>" must name a sourced merchant.
  for (const t of texts) {
    for (const m of t.matchAll(/\bfrom\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/g)) {
      const claimed = norm(m[1]);
      if (!knownMerchants.some((k) => k.includes(claimed) || claimed.includes(k))) {
        violations.push(`merchant '${m[1]}' was not sourced this run`);
      }
    }
  }

  return { grounded: violations.length === 0, violations: Array.from(new Set(violations)) };
}

/**
 * Quoted trigger: every order line must carry a quote copied from the owner's own message.
 * A line whose quote is not a (case/space-insensitive) substring of that message is not allowed.
 */
export function validateTriggerQuote(
  ownerMessage: string,
  triggerQuote: string | undefined
): { valid: boolean; reason?: string } {
  const quote = norm(triggerQuote ?? '');
  if (quote.length < 3) return { valid: false, reason: 'Order line has no trigger quote from the owner' };
  if (!norm(ownerMessage).includes(quote)) {
    return { valid: false, reason: `Trigger quote "${triggerQuote}" does not appear in the owner's message` };
  }
  return { valid: true };
}
