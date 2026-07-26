// The API contract between backend and frontend — imported by BOTH sides so a shape change
// that isn't reflected on the other end fails to compile instead of failing at runtime in a
// browser six months from now. Backend builds these in src/api.ts; frontend's lib/api.ts
// imports them directly. No behavior lives here.
//
// TIME: every instant on the wire is an ISO-8601 UTC string. The browser converts to local
// for display (lib/clock.ts). The original HTML mock built Dates from device-local
// components, which quietly meant two people in different timezones disagreed about when
// the fast ended — storing UTC and rendering local is the fix, not a nicety.

/** Fluid ounces in one bottle — the unit the family actually counts in. */
export const BOTTLE_OZ = 16.9;
/** Fluid ounces in a US gallon; the vessel draws a marker here. */
export const GALLON_OZ = 128;
/** Default hydration target: a gallon plus one bottle (144.9 oz), from the mock. */
export const DEFAULT_GOAL_OZ = GALLON_OZ + BOTTLE_OZ;

/** Where a water entry came from. `seed` marks rows backfilled from the pre-app mock. */
export type WaterSource = "you" | "seed";

export interface WaterEntry {
  id: string;
  /** Fluid ounces, rounded to 0.1. */
  oz: number;
  /** ISO-8601 UTC. */
  loggedAt: string;
  source: WaterSource;
}

export interface Fast {
  id: string;
  /** ISO-8601 UTC — when the fast began. */
  startedAt: string;
  /** ISO-8601 UTC — the planned first meal. */
  targetEndAt: string;
  /** ISO-8601 UTC — set when the fast is broken or completed; null while active. */
  endedAt: string | null;
  /** Hydration target in fluid ounces. */
  goalOz: number;
  entries: WaterEntry[];
  /** Sum of `entries[].oz`, rounded to 0.1 — computed server-side so both apps agree. */
  totalOz: number;
}

export interface Me {
  email: string;
  displayName: string;
  /** null → the frontend shows StartFastPage instead of StatPage. */
  activeFast: Fast | null;
}

/**
 * What one family member's in-flight fast looks like to everyone else. Deliberately
 * narrow: a name, how far in, and how much water. No entry log, no email, no history —
 * the family strip is encouragement, not surveillance.
 */
export interface FamilyMember {
  displayName: string;
  startedAt: string;
  targetEndAt: string;
  totalOz: number;
  goalOz: number;
}

export interface FamilyView {
  members: FamilyMember[];
}

// ---- request bodies ----------------------------------------------------------------------

export interface StartFastBody {
  /** Length of the fast in hours (1–168). */
  hours: number;
  /** Hydration target in fluid ounces (8–400). */
  goalOz: number;
  /**
   * Optional ISO-8601 UTC backdate — "I actually started at midnight." Must be in the
   * past and within the last 7 days; omitted means "now".
   */
  startedAt?: string;
}

export interface LogWaterBody {
  /** Fluid ounces (0.1–300). */
  oz: number;
  /** Optional ISO-8601 UTC backdate for a drink you forgot to log. */
  loggedAt?: string;
}

export interface ApiError {
  error: string;
}
