/**
 * An in-memory Backend for demo.html — the whole app, no server, no database, no edge.
 *
 * This exists so the UI can be reviewed and driven (log water, delete an entry, start a
 * fast, watch the countdown tick) before any infrastructure is built, and so a design
 * change can be checked without standing up Postgres. It is never bundled into the
 * production entry point; only demo.html imports it.
 *
 * The seeded scenario is deliberately the real one: a 36-hour fast that began at midnight
 * with two 16.9 oz bottles logged, which is what the original HTML mock showed.
 */
import type {
  FamilyView,
  Fast,
  LogWaterBody,
  Me,
  PersonalStats,
  StartFastBody,
  WaterEntry,
} from "@shared/types.ts";
import { DEFAULT_GOAL_OZ } from "@shared/types.ts";
import type { Backend } from "./api.ts";
import { round1 } from "./format.ts";

export type Scenario = "fasting" | "no-fast";

let counter = 0;
function id(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** Local midnight today — the scenario anchors to the viewer's own clock. */
function midnightToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function atHourToday(hour: number): Date {
  const d = midnightToday();
  d.setHours(hour);
  return d;
}

function seedFast(): Fast {
  const started = midnightToday();
  const target = new Date(started.getTime() + 36 * 3_600_000);
  const entries: WaterEntry[] = [
    { id: id("e"), oz: 16.9, loggedAt: atHourToday(10).toISOString(), source: "seed" },
    { id: id("e"), oz: 16.9, loggedAt: atHourToday(13).toISOString(), source: "seed" },
  ];

  return {
    id: id("f"),
    startedAt: started.toISOString(),
    targetEndAt: target.toISOString(),
    endedAt: null,
    goalOz: DEFAULT_GOAL_OZ,
    entries,
    totalOz: round1(entries.reduce((t, e) => t + e.oz, 0)),
  };
}

function recompute(fast: Fast): Fast {
  fast.entries.sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0));
  fast.totalOz = round1(fast.entries.reduce((t, e) => t + e.oz, 0));
  return fast;
}

function delay<T>(value: T): Promise<T> {
  // A beat of latency, so loading states and double-tap guards are actually exercised
  // rather than resolving synchronously and hiding a race.
  return new Promise((resolve) => setTimeout(() => resolve(value), 140));
}

/**
 * Finished fasts, so the demo can show the stats page with something in it — and so
 * breaking the seeded fast visibly lands in history rather than vanishing.
 */
interface FinishedRow {
  id: string;
  startedAt: string;
  targetEndAt: string;
  endedAt: string;
  goalOz: number;
  totalOz: number;
}

function seedHistory(): FinishedRow[] {
  const midnight = midnightToday().getTime();
  const day = 24 * 3_600_000;
  const finished = (daysAgo: number, plannedH: number, ranH: number, oz: number): FinishedRow => {
    const started = midnight - daysAgo * day;
    return {
      id: id("f"),
      startedAt: new Date(started).toISOString(),
      targetEndAt: new Date(started + plannedH * 3_600_000).toISOString(),
      endedAt: new Date(started + ranH * 3_600_000).toISOString(),
      goalOz: DEFAULT_GOAL_OZ,
      totalOz: oz,
    };
  };
  return [
    finished(30, 24, 24, 118.3), // ran the full 24
    finished(16, 36, 21.5, 84.5), // broken early
    finished(6, 48, 41, 152.1), // the long one
  ];
}

/**
 * Mirrors `summarizeFasts` in the backend's domain.ts. Duplicated rather than imported
 * because the frontend never depends on backend code — `shared/types.ts` is the only thing
 * both sides share, and this file exists purely so demo.html can run with no server.
 */
function summarize(rows: readonly FinishedRow[]): PersonalStats {
  const oldestFirst = [...rows]
    .map((r) => {
      const started = new Date(r.startedAt).getTime();
      const ended = new Date(r.endedAt).getTime();
      return {
        ...r,
        durationMs: Math.max(0, ended - started),
        reachedTarget: ended >= new Date(r.targetEndAt).getTime(),
      };
    })
    .sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime() ||
        new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime() ||
        a.id.localeCompare(b.id),
    );

  let longest: PersonalStats["longest"] = null;
  let totalFastedMs = 0;
  let totalOz = 0;
  let reachedTargetCount = 0;
  for (const f of oldestFirst) {
    if (!longest || f.durationMs > longest.durationMs) longest = f;
    totalFastedMs += f.durationMs;
    totalOz += f.totalOz;
    if (f.reachedTarget) reachedTargetCount += 1;
  }

  return {
    history: [...oldestFirst].reverse(),
    longest,
    fastsFinished: oldestFirst.length,
    totalFastedMs,
    averageFastedMs: oldestFirst.length ? Math.round(totalFastedMs / oldestFirst.length) : 0,
    totalOz: round1(totalOz),
    reachedTargetCount,
  };
}

export function createMockBackend(scenario: Scenario): Backend {
  const state: { displayName: string; fast: Fast | null; finished: FinishedRow[] } = {
    displayName: "Pedro",
    fast: scenario === "fasting" ? seedFast() : null,
    finished: seedHistory(),
  };

  const sonia = (() => {
    const started = midnightToday();
    return {
      displayName: "Sonia",
      startedAt: started.toISOString(),
      targetEndAt: new Date(started.getTime() + 36 * 3_600_000).toISOString(),
      totalOz: 33.8,
      goalOz: DEFAULT_GOAL_OZ,
    };
  })();

  const me = (): Me => ({
    email: "you@example.com",
    displayName: state.displayName,
    activeFast: state.fast ? recompute({ ...state.fast, entries: [...state.fast.entries] }) : null,
  });

  return {
    me: () => delay(me()),

    setDisplayName: (displayName) => {
      state.displayName = displayName;
      return delay(me());
    },

    startFast: (body: StartFastBody) => {
      const started = body.startedAt ? new Date(body.startedAt) : new Date();
      state.fast = {
        id: id("f"),
        startedAt: started.toISOString(),
        targetEndAt: new Date(started.getTime() + body.hours * 3_600_000).toISOString(),
        endedAt: null,
        goalOz: body.goalOz,
        entries: [],
        totalOz: 0,
      };
      return delay(state.fast);
    },

    endFast: (fastId) => {
      if (!state.fast || state.fast.id !== fastId) {
        return Promise.reject(new Error("No active fast with that id"));
      }
      const ended: Fast = { ...state.fast, endedAt: new Date().toISOString() };
      // The point of the feature: a broken fast is kept, not discarded.
      state.finished.push({
        id: ended.id,
        startedAt: ended.startedAt,
        targetEndAt: ended.targetEndAt,
        endedAt: ended.endedAt!,
        goalOz: ended.goalOz,
        totalOz: ended.totalOz,
      });
      state.fast = null;
      return delay(ended);
    },

    logWater: (fastId, body: LogWaterBody) => {
      if (!state.fast || state.fast.id !== fastId) {
        return Promise.reject(new Error("No fast with that id"));
      }
      const entry: WaterEntry = {
        id: id("e"),
        oz: round1(body.oz),
        loggedAt: body.loggedAt ?? new Date().toISOString(),
        source: "you",
      };
      state.fast.entries.push(entry);
      recompute(state.fast);
      return delay(entry);
    },

    deleteWater: (entryId) => {
      if (state.fast) {
        state.fast.entries = state.fast.entries.filter((e) => e.id !== entryId);
        recompute(state.fast);
      }
      return delay(undefined as void);
    },

    family: (): Promise<FamilyView> => delay({ members: [sonia] }),

    stats: (): Promise<PersonalStats> => delay(summarize(state.finished)),
  };
}
