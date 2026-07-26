/**
 * The numbers here are deliberately the ones from the original HTML mock (a 36 h fast
 * beginning Sun 26 Jul 2026 00:00 with two 16.9 oz bottles and a 144.9 oz goal), so the
 * app is pinned to the behaviour it replaced rather than to whatever the code happens to do.
 */
import { describe, expect, it } from "bun:test";
import { BOTTLE_OZ, DEFAULT_GOAL_OZ, GALLON_OZ } from "../../shared/types.ts";
import {
  defaultDisplayName,
  fastProgress,
  round1,
  sumOz,
  toBottles,
  validateDisplayName,
  validateLogWater,
  validateStartFast,
} from "../src/domain.ts";

const START = new Date("2026-07-26T07:00:00Z"); // Sun 26 Jul, 00:00 Pacific
const TARGET = new Date("2026-07-27T19:00:00Z"); // Mon 27 Jul, 12:00 Pacific — 36 h later

describe("ounce arithmetic", () => {
  it("matches the mock's goal: one gallon plus one bottle", () => {
    expect(DEFAULT_GOAL_OZ).toBe(144.9);
    expect(GALLON_OZ + BOTTLE_OZ).toBe(144.9);
  });

  it("totals the two bottles logged so far as 33.8 oz", () => {
    expect(sumOz([{ oz: 16.9 }, { oz: 16.9 }])).toBe(33.8);
  });

  it("rounds once at the end so per-entry error doesn't compound", () => {
    // Three entries that each round up individually would drift; the sum must not.
    expect(sumOz([{ oz: 0.05 }, { oz: 0.05 }, { oz: 0.05 }])).toBe(0.2);
    expect(round1(16.94)).toBe(16.9);
    expect(round1(16.95)).toBe(17);
  });

  it("expresses ounces in bottles", () => {
    expect(toBottles(33.8)).toBe(2);
    expect(toBottles(8.45)).toBe(0.5);
  });
});

describe("fastProgress", () => {
  it("reports elapsed, remaining and percent mid-fast", () => {
    const now = new Date("2026-07-26T19:00:00Z"); // 12 h in, a third of the way
    const p = fastProgress(START, TARGET, now);

    expect(p.elapsedMs).toBe(12 * 3600_000);
    expect(p.remainingMs).toBe(24 * 3600_000);
    expect(p.percent).toBeCloseTo(33.33, 1);
    expect(p.complete).toBe(false);
  });

  it("clamps at completion instead of counting negative", () => {
    const p = fastProgress(START, TARGET, new Date("2026-07-28T00:00:00Z"));

    expect(p.remainingMs).toBe(0);
    expect(p.percent).toBe(100);
    expect(p.complete).toBe(true);
  });

  it("clamps a not-yet-started fast at zero rather than negative elapsed", () => {
    const p = fastProgress(START, TARGET, new Date("2026-07-25T00:00:00Z"));

    expect(p.elapsedMs).toBe(0);
    expect(p.percent).toBe(0);
  });
});

describe("validateStartFast", () => {
  const now = new Date("2026-07-26T19:00:00Z");

  it("accepts a plain 36-hour fast and derives the target", () => {
    const r = validateStartFast({ hours: 36, goalOz: 144.9 }, now);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.startedAt).toEqual(now);
    expect(r.value.targetEndAt.getTime() - now.getTime()).toBe(36 * 3600_000);
    expect(r.value.goalOz).toBe(144.9);
  });

  it("accepts a backdated start — 'I actually began at midnight'", () => {
    const r = validateStartFast(
      { hours: 36, goalOz: 144.9, startedAt: START.toISOString() },
      now,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.startedAt).toEqual(START);
    expect(r.value.targetEndAt).toEqual(TARGET);
  });

  it("rejects a future start", () => {
    const r = validateStartFast(
      { hours: 36, goalOz: 144.9, startedAt: "2026-07-27T00:00:00Z" },
      now,
    );
    expect(r).toEqual({ ok: false, error: "startedAt cannot be in the future" });
  });

  it("rejects a backdate more than a week old", () => {
    const r = validateStartFast(
      { hours: 36, goalOz: 144.9, startedAt: "2026-07-01T00:00:00Z" },
      now,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a window that is already over", () => {
    // Backdated 20 h with a 2 h duration — the meal time is in the past.
    const r = validateStartFast(
      { hours: 2, goalOz: 100, startedAt: "2026-07-25T23:00:00Z" },
      now,
    );
    expect(r.ok).toBe(false);
  });

  it.each([
    ["hours below the floor", { hours: 0, goalOz: 100 }],
    ["hours beyond a week", { hours: 200, goalOz: 100 }],
    ["a goal below the floor", { hours: 36, goalOz: 1 }],
    ["a goal beyond the ceiling", { hours: 36, goalOz: 900 }],
    ["a non-numeric duration", { hours: "36", goalOz: 100 }],
    ["NaN", { hours: NaN, goalOz: 100 }],
    ["a null body", null],
  ])("rejects %s", (_label, body) => {
    expect(validateStartFast(body, now).ok).toBe(false);
  });
});

describe("validateLogWater", () => {
  const now = new Date("2026-07-26T19:00:00Z");

  it("accepts a bottle logged now", () => {
    const r = validateLogWater({ oz: 16.9 }, now, START);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ oz: 16.9, loggedAt: now });
  });

  it("accepts a backdated entry inside the fast window", () => {
    const at = "2026-07-26T17:00:00Z";
    const r = validateLogWater({ oz: 16.9, loggedAt: at }, now, START);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.loggedAt).toEqual(new Date(at));
  });

  it("rejects an entry backdated before the fast began", () => {
    const r = validateLogWater({ oz: 16.9, loggedAt: "2026-07-25T00:00:00Z" }, now, START);
    expect(r).toEqual({ ok: false, error: "loggedAt cannot be before the fast started" });
  });

  it("rejects a future entry", () => {
    const r = validateLogWater({ oz: 16.9, loggedAt: "2026-07-27T00:00:00Z" }, now, START);
    expect(r).toEqual({ ok: false, error: "loggedAt cannot be in the future" });
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["absurd", 400],
    ["non-numeric", "16.9"],
  ])("rejects %s ounces", (_label, oz) => {
    expect(validateLogWater({ oz }, now, START).ok).toBe(false);
  });

  it("rounds to one decimal on the way in", () => {
    const r = validateLogWater({ oz: 16.94 }, now, START);
    expect(r.ok && r.value.oz).toBe(16.9);
  });
});

describe("display names", () => {
  it("derives a readable default from an email local part", () => {
    expect(defaultDisplayName("abc123@example.com")).toBe("Abc123");
    expect(defaultDisplayName("sam.rivera@example.com")).toBe("Sam Rivera");
    expect(defaultDisplayName("first_last@example.com")).toBe("First Last");
  });

  it("trims and bounds a user-supplied name", () => {
    expect(validateDisplayName("  Michelle  ")).toEqual({ ok: true, value: "Michelle" });
    expect(validateDisplayName("   ").ok).toBe(false);
    expect(validateDisplayName("x".repeat(41)).ok).toBe(false);
    expect(validateDisplayName(42).ok).toBe(false);
  });
});
