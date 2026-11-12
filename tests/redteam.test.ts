import { describe, it, expect } from 'vitest';
import { SEEDED_MANDATE } from '../src/lib/restock-store';
import { RED_TEAM_PRESETS, normalizeRedTeamInput, runRedTeam } from '../src/lib/redteam';
import { explainCounterfactuals } from '../src/lib/counterfactual';
import { evaluateMandate, type CandidateOffer } from '../src/lib/policy';
import { canonicalJson } from '../src/lib/canonical-json';
import { signReceiptEd25519, verifyReceiptEd25519 } from '../src/lib/receipt-ed25519';

const NOW = '2026-11-12T00:00:00Z';
const preset = (id: string) => RED_TEAM_PRESETS.find((p) => p.id === id)!.input;

describe('red-team harness', () => {
  it('prompt injection is stripped and cannot change the quantity', () => {
    const r = runRedTeam(preset('inject-budget'), SEEDED_MANDATE, NOW);
    expect(r.sanitized.flagged).toBe(true);
    expect(r.sanitized.fencedPrompt.toLowerCase()).not.toContain('auto-approve');
    expect(r.naive.followedInjection).toBe(true);
    expect(r.naive.qty).toBe(500);
    expect(r.restockPilot.qty).toBe(14);
    expect(r.restockPilot.decision).not.toBe('BLOCK'); // honest price, legitimate category
    expect(r.restockPilot.decision).toBe('ASK'); // $868 > $150 owner threshold: never auto-ALLOW
    expect(r.unsafeSpendAvoided).toBeGreaterThan(30000);
  });

  it('out-of-mandate category is blocked regardless of title text', () => {
    const r = runRedTeam(preset('category'), SEEDED_MANDATE, NOW);
    expect(r.restockPilot.decision).toBe('BLOCK');
  });

  it('too-cheap offer is held for the owner', () => {
    const r = runRedTeam(preset('too-cheap'), SEEDED_MANDATE, NOW);
    expect(r.restockPilot.decision).toBe('ASK');
    expect(r.restockPilot.policy.askReasons.join(' ')).toMatch(/below|peer median/i);
  });

  it('budget drain and refurbished consumables and wrong product are all blocked', () => {
    for (const id of ['budget-drain', 'fake-fresh', 'wrong-product']) {
      expect(runRedTeam(preset(id), SEEDED_MANDATE, NOW).restockPilot.decision, id).toBe('BLOCK');
    }
  });

  it('every preset is deterministic', () => {
    for (const p of RED_TEAM_PRESETS) {
      const a = runRedTeam(p.input, SEEDED_MANDATE, NOW);
      const b = runRedTeam(p.input, SEEDED_MANDATE, NOW);
      expect(a).toEqual(b);
    }
  });

  it('normalizeRedTeamInput bounds hostile input', () => {
    const n = normalizeRedTeamInput({ title: 'x'.repeat(5000), unitPrice: -5, qty: 1e12, condition: 'pristine', spendSoFar: NaN });
    expect(n.title.length).toBeLessThanOrEqual(600);
    expect(n.unitPrice).toBeGreaterThan(0);
    expect(n.qty).toBeLessThanOrEqual(100000);
    expect(n.condition).toBe('new');
    expect(n.spendSoFar).toBe(0);
    expect(() => normalizeRedTeamInput(null)).toThrow();
  });
});

describe('counterfactual explainer', () => {
  const offer: CandidateOffer = {
    id: 'x', sku: 'ESPRESSO-5LB', merchantName: 'M', title: 't', category: 'Coffee Beans', condition: 'new',
    unitPrice: 100, totalPrice: 2000, packSize: 1, inStock: true, sameProduct: true,
  };

  it('over-cap order gets a verified smaller quantity that re-evaluates better', () => {
    const base = evaluateMandate(SEEDED_MANDATE, 0, offer, 100, NOW);
    expect(base.decision).toBe('BLOCK');
    const cf = explainCounterfactuals(SEEDED_MANDATE, 0, offer, 100, NOW);
    expect(cf.decision).toBe('BLOCK');
    expect(cf.items.some((i) => i.rule.includes('Rule 5'))).toBe(true);
    expect(cf.verifiedAlternative).not.toBeNull();
    const alt = cf.verifiedAlternative!;
    const re = evaluateMandate(SEEDED_MANDATE, 0, { ...offer, totalPrice: alt.total }, 100, NOW);
    expect(re.decision).toBe(alt.decision);
    expect(re.decision).not.toBe('BLOCK');
  });

  it('ALLOW decisions produce no suggestions', () => {
    const ok = { ...offer, unitPrice: 10, totalPrice: 100 };
    const cf = explainCounterfactuals(SEEDED_MANDATE, 0, ok, 10, NOW);
    expect(cf.decision).toBe('ALLOW');
    expect(cf.items).toHaveLength(0);
    expect(cf.verifiedAlternative).toBeNull();
  });

  it('category block is owner-only, never agent-fixable', () => {
    const cf = explainCounterfactuals(SEEDED_MANDATE, 0, { ...offer, category: 'Furniture' }, 100, NOW);
    const item = cf.items.find((i) => i.rule.includes('Rule 2'))!;
    expect(item.fixableBy).toBe('OWNER');
  });
});

describe('shared canonical JSON / receipts', () => {
  it('sorts keys and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: [undefined, { d: 1, c: 2 }], z: undefined })).toBe('{"a":[null,{"c":2,"d":1}],"b":1}');
  });

  it('signed receipt verifies and tampering is detected', () => {
    const r = signReceiptEd25519({ poId: 'P1', totalPrice: 868 });
    expect(verifyReceiptEd25519(r).valid).toBe(true);
    const bad = { ...r, payload: { ...r.payload, totalPrice: 1 } };
    expect(verifyReceiptEd25519(bad).valid).toBe(false);
  });
});
