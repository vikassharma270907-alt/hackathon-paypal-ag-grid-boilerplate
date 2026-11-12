/** Shared input validators for untrusted request bodies. */

/** A positive, finite money amount with at most 2 decimal places (number or numeric string). */
export function isValidMoney(value: unknown, max = 10_000_000): boolean {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return false;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 && n <= max;
}

/** Strings only, bounded length. */
export function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** Copy only whitelisted keys from an untrusted object (blocks mass assignment). */
export function pick<T extends object, K extends keyof T>(source: unknown, keys: readonly K[]): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = (source as T)[key];
    }
  }
  return out;
}
