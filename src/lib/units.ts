/**
 * RestockPilot Unit-Price Normalizer (lib/units.ts)
 *
 * Pure, deterministic. Parses pack descriptions out of supplier / Channel3 titles and
 * computes price per base unit so the agent never picks a "cheaper-looking" pack that
 * actually costs more per cup / lb / ml. If a title cannot be parsed, callers get an
 * explicit "hold: cannot compare unit price" reason instead of a guess.
 */

export type NormalizedUnit =
  | 'count'
  | 'weight_lb'
  | 'weight_g'
  | 'weight_oz'
  | 'volume_ml'
  | 'volume_oz';

export interface ParsedPack {
  /** Number of packs / items (e.g. 12 in "12 x 355 ml"; 1 for a single "5 lb bag"). */
  count: number;
  /** Size of each item in `unit` (e.g. 355). 1 for pure counts. */
  unitSize: number;
  /** count * unitSize, expressed in `unit`. */
  totalBaseUnits: number;
  unit: 'count' | 'ml' | 'oz' | 'lb' | 'g';
  normalizedUnit: NormalizedUnit;
}

interface UnitSpec {
  unit: ParsedPack['unit'];
  normalizedUnit: NormalizedUnit;
  factor: number; // multiplier from the written unit into `unit`
}

function resolveUnit(raw: string): UnitSpec | null {
  const u = raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
  if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return { unit: 'ml', normalizedUnit: 'volume_ml', factor: 1 };
  if (['l', 'liter', 'liters', 'litre', 'litres'].includes(u)) return { unit: 'ml', normalizedUnit: 'volume_ml', factor: 1000 };
  if (u === 'fl oz' || u === 'floz' || u === 'fluid ounce' || u === 'fluid ounces') return { unit: 'oz', normalizedUnit: 'volume_oz', factor: 1 };
  if (u === 'gallon' || u === 'gallons' || u === 'gal') return { unit: 'oz', normalizedUnit: 'volume_oz', factor: 128 };
  if (u === 'oz' || u === 'ounce' || u === 'ounces') return { unit: 'oz', normalizedUnit: 'weight_oz', factor: 1 };
  if (['lb', 'lbs', 'pound', 'pounds'].includes(u)) return { unit: 'lb', normalizedUnit: 'weight_lb', factor: 1 };
  if (['kg', 'kilogram', 'kilograms'].includes(u)) return { unit: 'g', normalizedUnit: 'weight_g', factor: 1000 };
  if (['g', 'gram', 'grams'].includes(u)) return { unit: 'g', normalizedUnit: 'weight_g', factor: 1 };
  return null;
}

const UNIT_ALT = 'fl\\.?\\s*oz|fluid\\s+ounces?|milliliters?|ml|liters?|litres?|l|gallons?|gal|ounces?|oz|lbs?|pounds?|kilograms?|kg|grams?|g';
const NUM = '(\\d+(?:\\.\\d+)?)';

function round(n: number, dp = 6): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function countPack(count: number): ParsedPack {
  return { count, unitSize: 1, totalBaseUnits: count, unit: 'count', normalizedUnit: 'count' };
}

/**
 * Parse a pack description. Priority: "N x SIZE unit" > explicit counts > single weight/volume.
 * Returns null when nothing reliable can be extracted (safe failure, never guesses).
 */
export function parsePackDescription(title: string): ParsedPack | null {
  if (typeof title !== 'string' || title.trim().length === 0) return null;
  const text = title.trim();

  // 1. Multiplier with size: "12 x 355 ml", "6 x 32 fl oz"
  const mult = new RegExp(`\\b(\\d+)\\s*[x×]\\s*${NUM}\\s*(${UNIT_ALT})(?![a-z])`, 'i').exec(text);
  if (mult) {
    const spec = resolveUnit(mult[3]);
    const count = parseInt(mult[1], 10);
    const size = parseFloat(mult[2]) * (spec?.factor ?? 1);
    if (spec && count > 0 && size > 0) {
      return {
        count,
        unitSize: round(size),
        totalBaseUnits: round(count * size),
        unit: spec.unit,
        normalizedUnit: spec.normalizedUnit,
      };
    }
  }

  // 2. Explicit counts: "pack of 50", "case of 12", "6-pack", "100 ct", "500 count", "250 pcs", "4 sleeves"
  const countPatterns: RegExp[] = [
    /\b(?:pack|case|box|carton|bundle|set)\s+of\s+(\d+)\b/i,
    /\b(\d+)\s*-?\s*pack\b/i,
    /\b(\d+)\s*(?:ct|count|pcs?|pieces?|sleeves?|units?)\b/i,
  ];
  for (const re of countPatterns) {
    const m = re.exec(text);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > 0) return countPack(n);
    }
  }

  // 3. Single weight / volume: "5 lb", "1 kg", "2.5 lbs", "1 Gallon", "1 Liter"
  const single = new RegExp(`\\b${NUM}\\s*(${UNIT_ALT})(?![a-z])`, 'i').exec(text);
  if (single) {
    const spec = resolveUnit(single[2]);
    const size = parseFloat(single[1]) * (spec?.factor ?? 1);
    if (spec && size > 0) {
      return { count: 1, unitSize: round(size), totalBaseUnits: round(size), unit: spec.unit, normalizedUnit: spec.normalizedUnit };
    }
  }

  return null;
}

export interface BaseUnitPriceResult {
  parsed: boolean;
  pricePerBaseUnit: number | null;
  formattedUnitPrice: string;
  normalizedUnit?: NormalizedUnit;
  pack?: ParsedPack;
  errorReason?: string;
}

function formatMoney(n: number): string {
  // Sub-cent unit prices keep 4 decimals so they stay meaningful (e.g. $0.0034 / ml).
  return n >= 0.01 ? n.toFixed(2) : n.toFixed(4);
}

/** Price per base unit for a total pack price + title. */
export function computeBaseUnitPrice(totalPrice: number, title: string): BaseUnitPriceResult {
  const pack = parsePackDescription(title);
  if (!pack || !Number.isFinite(totalPrice) || totalPrice < 0) {
    return {
      parsed: false,
      pricePerBaseUnit: null,
      formattedUnitPrice: 'hold: cannot compare unit price',
      errorReason: 'hold: cannot compare unit price — pack size could not be parsed from the listing title',
    };
  }
  const per = round(totalPrice / pack.totalBaseUnits, 4);
  const display = Number(formatMoney(per));
  return {
    parsed: true,
    pricePerBaseUnit: display,
    formattedUnitPrice: `$${formatMoney(per)} / ${pack.unit}`,
    normalizedUnit: pack.normalizedUnit,
    pack,
  };
}

export interface UnitComparison {
  comparable: boolean;
  cheaperOffer: 'A' | 'B' | 'TIE' | null;
  unitPriceA: number | null;
  unitPriceB: number | null;
  savingsPct: number;
  explanation: string;
}

// Canonical factors so lb vs g (or ml vs fl oz) can be compared on the same axis.
const CANON: Record<NormalizedUnit, { dim: string; toCanon: number }> = {
  count: { dim: 'count', toCanon: 1 },
  weight_lb: { dim: 'weight', toCanon: 453.592 },
  weight_g: { dim: 'weight', toCanon: 1 },
  weight_oz: { dim: 'weight', toCanon: 28.3495 },
  volume_ml: { dim: 'volume', toCanon: 1 },
  volume_oz: { dim: 'volume', toCanon: 29.5735 },
};

/** Compare two offers by true cost per unit, not sticker price. */
export function compareOfferUnitEconomics(
  a: { title: string; totalPrice: number },
  b: { title: string; totalPrice: number }
): UnitComparison {
  const ua = computeBaseUnitPrice(a.totalPrice, a.title);
  const ub = computeBaseUnitPrice(b.totalPrice, b.title);
  const fail = (explanation: string): UnitComparison => ({
    comparable: false,
    cheaperOffer: null,
    unitPriceA: ua.pricePerBaseUnit,
    unitPriceB: ub.pricePerBaseUnit,
    savingsPct: 0,
    explanation,
  });

  if (!ua.parsed || !ub.parsed || !ua.pack || !ub.pack) {
    return fail('hold: cannot compare unit price — at least one pack size could not be parsed');
  }
  const ca = CANON[ua.pack.normalizedUnit];
  const cb = CANON[ub.pack.normalizedUnit];
  if (ca.dim !== cb.dim) {
    return fail(`Incompatible unit dimensions (${ca.dim} vs ${cb.dim}); offers cannot be compared per unit`);
  }

  const canonA = a.totalPrice / (ua.pack.totalBaseUnits * ca.toCanon);
  const canonB = b.totalPrice / (ub.pack.totalBaseUnits * cb.toCanon);
  const base = {
    comparable: true,
    unitPriceA: ua.pricePerBaseUnit,
    unitPriceB: ub.pricePerBaseUnit,
  };

  if (Math.abs(canonA - canonB) < 1e-12) {
    return { ...base, cheaperOffer: 'TIE', savingsPct: 0, explanation: 'Both offers cost the same per unit' };
  }
  const aCheaper = canonA < canonB;
  const hi = Math.max(canonA, canonB);
  const lo = Math.min(canonA, canonB);
  const savingsPct = Math.round(((hi - lo) / hi) * 100);
  const winner = aCheaper ? 'A' : 'B';
  return {
    ...base,
    cheaperOffer: winner,
    savingsPct,
    explanation: `Offer ${winner} has ${savingsPct}% lower cost per unit despite its sticker price`,
  };
}
