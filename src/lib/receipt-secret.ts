/**
 * Single source of truth for the docket-receipt signing secret.
 *
 * Fail closed: in a production runtime the public fallback key from source must never sign
 * receipts, because anyone with the repository could forge them. Local/test use the fallback.
 * A sandbox demo deployment may opt in explicitly with ALLOW_INSECURE_DEMO_RECEIPT_KEY=true.
 */
const FALLBACK_SECRET = 'restockpilot-hackathon-fips180-4-secret-key-2026';

export function getReceiptSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.RECEIPT_SIGNING_SECRET;
  if (configured) return configured;

  const isProductionRuntime =
    env.NODE_ENV === 'production' && env.NEXT_PHASE !== 'phase-production-build';
  if (isProductionRuntime && env.ALLOW_INSECURE_DEMO_RECEIPT_KEY !== 'true') {
    throw new Error(
      'RECEIPT_SIGNING_SECRET is not set. Refusing to sign or verify receipts with the public fallback key in production.'
    );
  }
  return FALLBACK_SECRET;
}
