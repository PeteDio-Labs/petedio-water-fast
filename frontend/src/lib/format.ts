/**
 * Display formatting. Instants arrive from the API as ISO-8601 UTC strings and are rendered
 * in the viewer's local timezone — the original mock built Dates from local components, so
 * two people in different timezones would have disagreed about when the fast ended.
 */
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

/**
 * "111.1 oz to go" — the one thing about the goal you can't read off the page already.
 *
 * This used to restate the goal itself ("8.6 bottles · 1 gal + 1 bottle") and convert the
 * remainder back into bottles. Both were already on screen: the vessel's dashed 1 GAL mark
 * is the goal, and the section meta counts the bottles.
 */
export function goalNote(goalOz: number, totalOz: number): string {
  const left = round1(Math.max(0, goalOz - totalOz));
  return left > 0 ? `${left} oz to go` : "Target met";
}

/** Initial for the family-strip avatar. */
export function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
