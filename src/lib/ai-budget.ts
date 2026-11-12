/**
 * Demo spend cap for model calls (pure in-process counter).
 *
 * A public demo must not burn free-tier quota or surprise-bill the owner. After the daily cap is
 * reached, callers skip the model and use the deterministic path; the UI/logs label this
 * "capped replay" so it is never passed off as live AI.
 */
const DEFAULT_DAILY_CAP = 60;

interface BudgetState {
  day: string;
  used: number;
}

let state: BudgetState = { day: today(), used: 0 };

function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function aiDailyCap(): number {
  const raw = Number(process.env.AI_DAILY_CALL_CAP);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_DAILY_CAP;
}

function roll(now: Date) {
  const d = today(now);
  if (state.day !== d) state = { day: d, used: 0 };
}

export function aiBudgetStatus(now: Date = new Date()) {
  roll(now);
  const cap = aiDailyCap();
  return { day: state.day, used: state.used, cap, remaining: Math.max(0, cap - state.used), capped: state.used >= cap };
}

/** Reserve one model call. Returns false when the cap is reached (caller must use fallback). */
export function tryConsumeAiCall(now: Date = new Date()): boolean {
  roll(now);
  if (state.used >= aiDailyCap()) return false;
  state.used += 1;
  return true;
}

export function resetAiBudget() {
  state = { day: today(), used: 0 };
}

export class AiBudgetExceededError extends Error {
  constructor() {
    super(`AI daily call cap reached (${aiDailyCap()}); serving labelled deterministic replay`);
    this.name = 'AiBudgetExceededError';
  }
}
