/**
 * Untrusted-text hygiene for the AI layer (pure, deterministic, zero I/O).
 *
 *  - maskPii: removes emails and phone numbers from owner messages BEFORE they reach any model.
 *  - neutralizeUntrustedText: treats third-party (Channel3 / merchant) text as DATA. Fence-tag
 *    escapes are removed and instruction-looking phrases are replaced with a visible marker.
 *    This is defence in depth only; the real boundary is that the AI has no money tools and the
 *    deterministic policy gate decides.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 7+ digits, optionally with +country code, spaces, dots, dashes, parentheses.
const PHONE_RE = /(?<![\w$])\+?\d[\d\s().-]{5,}\d(?!\w)/g;

export interface MaskResult {
  text: string;
  emailsMasked: number;
  phonesMasked: number;
}

export function maskPiiDetailed(input: string): MaskResult {
  let emailsMasked = 0;
  let phonesMasked = 0;
  let text = String(input ?? '').replace(EMAIL_RE, () => {
    emailsMasked += 1;
    return '[EMAIL]';
  });
  text = text.replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, '');
    // Require 7-15 digits so plain money/quantity numbers like "1,200" or "3500" are never touched.
    if (digits.length < 7 || digits.length > 15) return m;
    phonesMasked += 1;
    return '[PHONE]';
  });
  return { text, emailsMasked, phonesMasked };
}

export function maskPii(input: string): string {
  return maskPiiDetailed(input).text;
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|your\s+|the\s+|previous\s+|prior\s+)*(?:instructions?|rules?|budget(?:\s+cap)?s?|caps?|limits?|polic(?:y|ies))/gi,
  /disregard\s+(?:all\s+|your\s+|the\s+|previous\s+)*(?:instructions?|rules?|budget|polic(?:y|ies))/gi,
  /system\s*(?:override|prompt|message|:)/gi,
  /(?:auto[-\s]?)?approve[sd]?\s+(?:this|the\s+order|automatically|immediately)/gi,
  /owner\s+pre-?approved/gi,
  /bypass\s+(?:the\s+)?(?:budget|policy|caps?|limits?|checks?)/gi,
  /set\s+decision\s*=\s*\w+/gi,
  /\bbuy\s+\d{2,}\b/gi,
  /you\s+are\s+now\b/gi,
];

export const INJECTION_MARKER = '[removed-instruction]';

export interface NeutralizeResult {
  text: string;
  flagged: boolean;
  matches: number;
}

export function neutralizeUntrustedTextDetailed(input: string, maxLen = 240): NeutralizeResult {
  let text = String(input ?? '');
  let matches = 0;

  // Never let listing text open/close our own fence or inject markup.
  text = text.replace(/<\/?\s*untrusted_merchant_listing[^>]*>/gi, () => {
    matches += 1;
    return INJECTION_MARKER;
  });
  text = text.replace(/[<>`]/g, ' ');

  for (const re of INJECTION_PATTERNS) {
    text = text.replace(re, () => {
      matches += 1;
      return INJECTION_MARKER;
    });
  }

  text = text.replace(/\s+/g, ' ').trim().slice(0, maxLen);
  return { text, flagged: matches > 0, matches };
}

export function neutralizeUntrustedText(input: string, maxLen = 240): string {
  return neutralizeUntrustedTextDetailed(input, maxLen).text;
}
