/**
 * Deterministic JSON with sorted keys. Pure and dependency free so the SAME function runs on the
 * server (signing) and in the browser (/verify), guaranteeing both hash identical bytes.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    // undefined has no JSON form; map to null like JSON.stringify does.
    return '[' + value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',') + ']';
  }
  const rec = value as Record<string, unknown>;
  return (
    '{' +
    Object.keys(rec)
      .filter((k) => rec[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`)
      .join(',') +
    '}'
  );
}
