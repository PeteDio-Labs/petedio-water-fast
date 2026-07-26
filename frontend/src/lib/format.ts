/**
 * Display formatting. Instants arrive from the API as ISO-8601 UTC strings and are rendered
 * in the viewer's local timezone — the original mock built Dates from local components, so
 * two people in different timezones would have disagreed about when the fast ended.
 */
import { BOTTLE_OZ, GALLON_OZ } from "@shared/types.ts";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function clockTime(d: Date): string {
  const h24 = d.getHours();
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${pad(d.getMinutes())} ${ampm}`;
}

/** "Monday, 12:00 PM" — the first-meal stamp. */
export function longStamp(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${clockTime(d)}`;
}

/** "Sun 12:00 AM" — the compact timeline stamp. */
export function shortStamp(iso: string): string {
  const d = new Date(iso);
  return `${SHORT[d.getDay()]} ${clockTime(d)}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The entry-list stamp: "10:00 AM" for today, "Sun 10:00 AM" otherwise.
 *
 * Most entries are from today, and at phone width the weekday prefix was the difference
 * between the row fitting on one line and wrapping. It earns its place only on a multi-day
 * fast, which is exactly when it appears.
 */
export function logStamp(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return isSameDay(d, now) ? clockTime(d) : `${SHORT[d.getDay()]} ${clockTime(d)}`;
}

/** Splits a duration into the zero-padded pieces the countdown renders. */
export function countdownParts(ms: number): { hh: string; mm: string; ss: string } {
  const clamped = Math.max(0, ms);
  return {
    hh: pad(Math.floor(clamped / 3_600_000)),
    mm: pad(Math.floor((clamped % 3_600_000) / 60_000)),
    ss: pad(Math.floor((clamped % 60_000) / 1000)),
  };
}

/** "12h 30m fasted" */
export function elapsedLabel(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m fasted`;
}

export function toBottles(oz: number): number {
  return round1(oz / BOTTLE_OZ);
}

/** "2 bottles", "½ bottle", or null when the amount isn't a clean multiple. */
export function bottleName(oz: number): string | null {
  const b = Math.round((oz / BOTTLE_OZ) * 100) / 100;
  if (b === 1) return "1 bottle";
  if (b === 0.5) return "½ bottle";
  if (b === Math.floor(b) && b > 0) return `${b} bottles`;
  return null;
}

/** The entry-list line: "2 bottles · 33.8 oz", or just the ounces. */
export function entryLabel(oz: number): string {
  const name = bottleName(oz);
  return name ? `${name}  ·  ${oz} oz` : `${oz} oz`;
}

/** "8.6 bottles · 1 gal + 1 bottle → 111.1 oz to go (6.6 bottles)" */
export function goalNote(goalOz: number, totalOz: number): string {
  const bottles = round1(goalOz / BOTTLE_OZ);
  const shape =
    goalOz >= GALLON_OZ
      ? `1 gal + ${round1((goalOz - GALLON_OZ) / BOTTLE_OZ)} bottle`
      : `${round1(goalOz / GALLON_OZ)} gal`;

  const left = round1(Math.max(0, goalOz - totalOz));
  const tail =
    left > 0 ? `${left} oz to go (${round1(left / BOTTLE_OZ)} bottles)` : "target met";

  return `${bottles} bottles · ${shape}  →  ${tail}`;
}

/** Initial for the family-strip avatar. */
export function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
