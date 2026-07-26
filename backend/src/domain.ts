/**
 * Pure fasting/hydration logic — no database, no HTTP, no clock of its own (every function
 * that needs "now" takes it as an argument). Everything here is directly unit-testable, and
 * the numbers it produces are the ones the UI renders, so the countdown and oz totals are
 * asserted in `test/domain.test.ts` rather than eyeballed in a browser.
 */
import { BOTTLE_OZ, type WaterEntry } from "../../shared/types.ts";

export const MAX_FAST_HOURS = 168; // 7 days — past this, get a doctor, not an app
export const MIN_FAST_HOURS = 1;
export const MIN_GOAL_OZ = 8;
export const MAX_GOAL_OZ = 400;
export const MIN_ENTRY_OZ = 0.1;
export const MAX_ENTRY_OZ = 300;
/** How far back a fast may be backdated when started — covers "I began at midnight". */
export const MAX_BACKDATE_MS = 7 * 24 * 60 * 60 * 1000;

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Round to one decimal place — the precision the whole app counts ounces in. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Total ounces across entries, rounded once at the end so per-entry error doesn't compound. */
export function sumOz(entries: readonly Pick<WaterEntry, "oz">[]): number {
  return round1(entries.reduce((total, e) => total + e.oz, 0));
}

/** Ounces expressed in bottles, for the "2 bottles · 33.8 oz" line. */
export function toBottles(oz: number): number {
  return round1(oz / BOTTLE_OZ);
}

export interface FastProgress {
  elapsedMs: number;
  /** Milliseconds until the planned first meal; 0 once the fast is complete. */
  remainingMs: number;
  /** 0–100, clamped — drives the timeline and the page's colour tint. */
  percent: number;
  complete: boolean;
}

/**
 * Where a fast stands at `now`. Clamped at both ends: a fast that hasn't started yet reads
 * 0%, and one past its target reads 100% and complete rather than going negative — the
 * original mock let the countdown run negative past the meal time.
 */
export function fastProgress(startedAt: Date, targetEndAt: Date, now: Date): FastProgress {
  const total = targetEndAt.getTime() - startedAt.getTime();
  const elapsed = now.getTime() - startedAt.getTime();
  const remaining = targetEndAt.getTime() - now.getTime();

  return {
    elapsedMs: Math.max(0, elapsed),
    remainingMs: Math.max(0, remaining),
    percent: total <= 0 ? 100 : Math.max(0, Math.min(100, (elapsed / total) * 100)),
    complete: remaining <= 0,
  };
}

function parseInstant(raw: string): Date | null {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface StartFastInput {
  hours: number;
  goalOz: number;
  startedAt?: unknown;
}

export interface StartFastPlan {
  startedAt: Date;
  targetEndAt: Date;
  goalOz: number;
}

/**
 * Turns a start-fast request into the concrete window to persist. Rejects anything that
 * would produce a nonsensical fast — a target in the past, a week-plus fast, a backdate
 * beyond a week — because these are cheap to get wrong from a phone and expensive to
 * unpick from the database afterwards.
 */
export function validateStartFast(body: unknown, now: Date): Validated<StartFastPlan> {
  if (typeof body !== "object" || body === null) return fail("body must be an object");
  const { hours, goalOz, startedAt } = body as StartFastInput;

  if (typeof hours !== "number" || !Number.isFinite(hours)) return fail("hours must be a number");
  if (hours < MIN_FAST_HOURS || hours > MAX_FAST_HOURS) {
    return fail(`hours must be between ${MIN_FAST_HOURS} and ${MAX_FAST_HOURS}`);
  }

  if (typeof goalOz !== "number" || !Number.isFinite(goalOz)) return fail("goalOz must be a number");
  if (goalOz < MIN_GOAL_OZ || goalOz > MAX_GOAL_OZ) {
    return fail(`goalOz must be between ${MIN_GOAL_OZ} and ${MAX_GOAL_OZ}`);
  }

  let start = now;
  if (startedAt !== undefined) {
    if (typeof startedAt !== "string") return fail("startedAt must be an ISO-8601 string");
    const parsed = parseInstant(startedAt);
    if (!parsed) return fail("startedAt is not a valid date");
    if (parsed.getTime() > now.getTime()) return fail("startedAt cannot be in the future");
    if (now.getTime() - parsed.getTime() > MAX_BACKDATE_MS) {
      return fail("startedAt cannot be more than 7 days ago");
    }
    start = parsed;
  }

  const targetEndAt = new Date(start.getTime() + hours * 3600_000);
  if (targetEndAt.getTime() <= now.getTime()) {
    return fail("that fast would already be over — pick a longer window");
  }

  return { ok: true, value: { startedAt: start, targetEndAt, goalOz: round1(goalOz) } };
}

export interface LogWaterPlan {
  oz: number;
  loggedAt: Date;
}

/**
 * Validates a water entry against the fast it belongs to. `loggedAt` is bounded by the
 * fast's own start rather than by wall-clock alone, so a backdated entry can't be attached
 * to a window it couldn't have happened in.
 */
export function validateLogWater(
  body: unknown,
  now: Date,
  fastStartedAt: Date,
): Validated<LogWaterPlan> {
  if (typeof body !== "object" || body === null) return fail("body must be an object");
  const { oz, loggedAt } = body as { oz?: unknown; loggedAt?: unknown };

  if (typeof oz !== "number" || !Number.isFinite(oz)) return fail("oz must be a number");
  const rounded = round1(oz);
  if (rounded < MIN_ENTRY_OZ || rounded > MAX_ENTRY_OZ) {
    return fail(`oz must be between ${MIN_ENTRY_OZ} and ${MAX_ENTRY_OZ}`);
  }

  let at = now;
  if (loggedAt !== undefined) {
    if (typeof loggedAt !== "string") return fail("loggedAt must be an ISO-8601 string");
    const parsed = parseInstant(loggedAt);
    if (!parsed) return fail("loggedAt is not a valid date");
    if (parsed.getTime() > now.getTime()) return fail("loggedAt cannot be in the future");
    if (parsed.getTime() < fastStartedAt.getTime()) {
      return fail("loggedAt cannot be before the fast started");
    }
    at = parsed;
  }

  return { ok: true, value: { oz: rounded, loggedAt: at } };
}

/**
 * Display name for a self-provisioned user, derived from their email local part
 * ("sam.rivera@example.com" → "Sam Rivera"). Rough by design — it exists so the family strip
 * is never blank before someone sets a real name via PATCH /api/me.
 */
export function defaultDisplayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return email;
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Trims and bounds a user-supplied display name. */
export function validateDisplayName(raw: unknown): Validated<string> {
  if (typeof raw !== "string") return fail("displayName must be a string");
  const trimmed = raw.trim();
  if (trimmed.length < 1) return fail("displayName cannot be empty");
  if (trimmed.length > 40) return fail("displayName must be 40 characters or fewer");
  return { ok: true, value: trimmed };
}
