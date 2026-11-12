/**
 * Strict input sanitizers for the users / products CRUD routes.
 * Only whitelisted, type-checked fields pass. Server-controlled fields (id, paypalPayerId,
 * riskScore, spend counters, history, transactions, zScore) can never be set by a client.
 */
import type { UserRecord, UserRole, UserStatus } from './users-data';
import type { ProductRecord } from './products-data';

export type Sanitized<T> = { ok: true; value: Partial<T> } | { ok: false; error: string };

const ROLES: readonly UserRole[] = ['ADMIN', 'PROCUREMENT_MANAGER', 'SUPPLIER', 'BUYER', 'FINANCE_AUDITOR'];
const STATUSES: readonly UserStatus[] = ['ACTIVE', 'PENDING', 'SUSPENDED', 'FLAGGED'];
const PRODUCT_TYPES = ['PHYSICAL', 'SERVICE', 'DIGITAL'] as const;
const PRODUCT_STATUSES: readonly ProductRecord['status'][] = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED'];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null;
}

function num(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function sanitizeUserInput(
  input: unknown,
  opts: { allowAdminRole: boolean }
): Sanitized<UserRecord> {
  if (!isObject(input)) return { ok: false, error: 'Body must be a JSON object.' };
  const out: Partial<UserRecord> = {};

  const text: Array<[keyof UserRecord, number]> = [['name', 120], ['company', 120], ['phone', 40]];
  for (const [key, max] of text) {
    if (input[key] === undefined) continue;
    const v = str(input[key], max);
    if (v === null) return { ok: false, error: `${key} must be a non-empty string up to ${max} characters.` };
    (out as Record<string, unknown>)[key] = v;
  }
  if (input.email !== undefined) {
    if (typeof input.email !== 'string' || !EMAIL_RE.test(input.email)) return { ok: false, error: 'email is invalid.' };
    out.email = input.email.trim();
  }
  if (input.avatarUrl !== undefined) {
    const v = str(input.avatarUrl, 500);
    if (v === null || !/^https:\/\//i.test(v)) return { ok: false, error: 'avatarUrl must be an https URL.' };
    out.avatarUrl = v;
  }
  if (input.role !== undefined) {
    if (!ROLES.includes(input.role as UserRole)) return { ok: false, error: 'role is invalid.' };
    if (input.role === 'ADMIN' && !opts.allowAdminRole) {
      return { ok: false, error: 'Assigning the ADMIN role requires operator credentials.' };
    }
    out.role = input.role as UserRole;
  }
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status as UserStatus)) return { ok: false, error: 'status is invalid.' };
    out.status = input.status as UserStatus;
  }
  return { ok: true, value: out };
}

export function sanitizeProductInput(input: unknown): Sanitized<ProductRecord> {
  if (!isObject(input)) return { ok: false, error: 'Body must be a JSON object.' };
  const out: Partial<ProductRecord> = {};

  const text: Array<[keyof ProductRecord, number]> = [
    ['sku', 64], ['name', 160], ['category', 80], ['description', 2000], ['supplierName', 160],
  ];
  for (const [key, max] of text) {
    if (input[key] === undefined) continue;
    const v = str(input[key], max);
    if (v === null) return { ok: false, error: `${key} must be a non-empty string up to ${max} characters.` };
    (out as Record<string, unknown>)[key] = v;
  }
  if (input.type !== undefined) {
    if (!PRODUCT_TYPES.includes(input.type as (typeof PRODUCT_TYPES)[number])) return { ok: false, error: 'type is invalid.' };
    out.type = input.type as ProductRecord['type'];
  }
  if (input.status !== undefined) {
    if (!PRODUCT_STATUSES.includes(input.status as ProductRecord['status'])) return { ok: false, error: 'status is invalid.' };
    out.status = input.status as ProductRecord['status'];
  }
  const numeric: Array<[keyof ProductRecord, number, number]> = [
    ['priceUsd', 0, 10_000_000],
    ['marketAverageUsd', 0, 10_000_000],
    ['stockUnits', 0, 10_000_000],
    ['minThresholdUnits', 0, 10_000_000],
    ['leadTimeDays', 0, 3650],
  ];
  for (const [key, min, max] of numeric) {
    if (input[key] === undefined) continue;
    const v = num(input[key], min, max);
    if (v === null) return { ok: false, error: `${key} must be a number between ${min} and ${max}.` };
    (out as Record<string, unknown>)[key] = v;
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 20 || !input.tags.every((t) => str(t, 40) !== null)) {
      return { ok: false, error: 'tags must be up to 20 strings of at most 40 characters.' };
    }
    out.tags = (input.tags as string[]).map((t) => t.trim());
  }
  return { ok: true, value: out };
}
