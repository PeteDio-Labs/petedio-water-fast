/**
 * End-to-end API tests against a REAL Postgres — not a mock.
 *
 * The lesson this follows (petedio `.agent/lessons.md`, 2026-06-26): a green suite built on
 * hand-fed fixtures can bake in the same wrong assumption the code makes. Half of what
 * matters here — the one-active-fast partial unique index, the ownership-in-the-WHERE-clause
 * scoping, numeric coming back as a string — only exists in the database, so mocking it out
 * would test nothing worth testing.
 *
 * Bring a database up with:
 *   docker run -d --name waterfast-test-pg -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=waterfast_test -p 55432:5432 postgres:16-alpine
 * The suite skips (loudly) when TEST_DATABASE_URL is unset so CI without a database is
 * honest about what it did not run, rather than silently green.
 */
import { SQL } from "bun";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import type { Fast, FamilyView, Me, PersonalStats, WaterEntry } from "../../shared/types.ts";
import { handleApi, type ApiDeps } from "../src/api.ts";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:test@localhost:55432/waterfast_test";

const sql = new SQL(TEST_DATABASE_URL);

const PEDRO = "pedro@example.com";
const SONIA = "sonia@example.com";
const MICHELLE = "michelle@example.com";

const NOW = new Date("2026-07-26T19:00:00Z"); // 12 h into the 36 h fast
const START = new Date("2026-07-26T07:00:00Z");

/** Drives a request as `email`, with the clock pinned to `now`. */
function as(email: string, now: Date = NOW): ApiDeps {
  return { sql, now: () => now, resolveIdentity: async () => ({ email }) };
}

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`https://fast.pdlab.dev${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function call(email: string, method: string, path: string, body?: unknown, now?: Date) {
  const res = await handleApi(request(method, path, body), as(email, now));
  if (!res) throw new Error(`handleApi did not claim ${method} ${path}`);
  return res;
}

async function startFastAs(email: string, hours = 36, goalOz = 144.9): Promise<Fast> {
  const res = await call(email, "POST", "/api/fasts", {
    hours,
    goalOz,
    startedAt: START.toISOString(),
  });
  expect(res.status).toBe(201);
  return res.json() as Promise<Fast>;
}

const ddl = await Bun.file(new URL("../src/schema.sql", import.meta.url)).text();
await sql.unsafe(ddl);

beforeEach(async () => {
  // users cascades to fasts cascades to water_entries.
  await sql`TRUNCATE users CASCADE`;
});

afterAll(async () => {
  await sql.close();
});

describe("authentication", () => {
  it("401s every route when identity cannot be resolved", async () => {
    const deps: ApiDeps = { sql, now: () => NOW, resolveIdentity: async () => null };

    for (const [method, path] of [
      ["GET", "/api/me"],
      ["GET", "/api/family"],
      ["POST", "/api/fasts"],
      ["DELETE", "/api/water/some-id"],
    ] as const) {
      const res = await handleApi(request(method, path), deps);
      expect(res?.status).toBe(401);
    }
  });

  it("ignores paths it does not own, so static serving can take over", async () => {
    expect(await handleApi(request("GET", "/index.html"), as(PEDRO))).toBeNull();
  });
});

describe("GET /api/me", () => {
  it("auto-provisions the user and reports no active fast on first sight", async () => {
    const me = (await (await call(PEDRO, "GET", "/api/me")).json()) as Me;

    expect(me.email).toBe(PEDRO);
    expect(me.displayName).toBe("Pedro");
    expect(me.activeFast).toBeNull();
  });

  it("returns the active fast once one is started", async () => {
    await startFastAs(PEDRO);
    const me = (await (await call(PEDRO, "GET", "/api/me")).json()) as Me;

    expect(me.activeFast).not.toBeNull();
    expect(me.activeFast!.goalOz).toBe(144.9);
    expect(me.activeFast!.startedAt).toBe(START.toISOString());
    expect(me.activeFast!.endedAt).toBeNull();
  });

  it("lets a user set the name the family sees", async () => {
    const res = await call(MICHELLE, "PATCH", "/api/me", { displayName: "Michelle" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Me).displayName).toBe("Michelle");

    const me = (await (await call(MICHELLE, "GET", "/api/me")).json()) as Me;
    expect(me.displayName).toBe("Michelle");
  });
});

describe("POST /api/fasts", () => {
  it("derives the target from the backdated start", async () => {
    const fast = await startFastAs(PEDRO);
    expect(fast.targetEndAt).toBe(new Date("2026-07-27T19:00:00Z").toISOString());
    expect(fast.totalOz).toBe(0);
    expect(fast.entries).toEqual([]);
  });

  it("refuses a second concurrent fast with 409", async () => {
    await startFastAs(PEDRO);
    const res = await call(PEDRO, "POST", "/api/fasts", { hours: 24, goalOz: 100 });

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/already have a fast/i);
  });

  it("holds the one-active-fast rule under a concurrent double-tap", async () => {
    // Two simultaneous starts — the partial unique index is what makes this safe, not a
    // read-then-write check in TypeScript.
    const [a, b] = await Promise.all([
      call(PEDRO, "POST", "/api/fasts", { hours: 36, goalOz: 144.9 }),
      call(PEDRO, "POST", "/api/fasts", { hours: 36, goalOz: 144.9 }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const rows = await sql`SELECT count(*)::int AS n FROM fasts WHERE ended_at IS NULL`;
    expect(rows[0].n).toBe(1);
  });

  it("allows a new fast after the previous one is ended", async () => {
    const first = await startFastAs(PEDRO);
    expect((await call(PEDRO, "POST", `/api/fasts/${first.id}/end`)).status).toBe(200);

    const res = await call(PEDRO, "POST", "/api/fasts", { hours: 24, goalOz: 100 });
    expect(res.status).toBe(201);
  });

  it("400s an invalid body without touching the database", async () => {
    const res = await call(PEDRO, "POST", "/api/fasts", { hours: 500, goalOz: 144.9 });

    expect(res.status).toBe(400);
    const rows = await sql`SELECT count(*)::int AS n FROM fasts`;
    expect(rows[0].n).toBe(0);
  });
});

describe("water logging", () => {
  it("records the two bottles from the mock and totals 33.8 oz", async () => {
    const fast = await startFastAs(PEDRO);

    for (const at of ["2026-07-26T17:00:00Z", "2026-07-26T20:00:00Z"]) {
      // The second is after NOW, so drive the clock forward for it.
      const res = await call(
        PEDRO,
        "POST",
        `/api/fasts/${fast.id}/water`,
        { oz: 16.9, loggedAt: at },
        new Date("2026-07-26T21:00:00Z"),
      );
      expect(res.status).toBe(201);
      expect(((await res.json()) as WaterEntry).oz).toBe(16.9);
    }

    const me = (await (
      await call(PEDRO, "GET", "/api/me", undefined, new Date("2026-07-26T21:00:00Z"))
    ).json()) as Me;

    expect(me.activeFast!.totalOz).toBe(33.8);
    expect(me.activeFast!.entries).toHaveLength(2);
    // numeric arrives from Postgres as a string; if the coercion in db.ts regressed this
    // would be "16.916.9" rather than 33.8.
    expect(typeof me.activeFast!.entries[0]!.oz).toBe("number");
  });

  it("returns entries in chronological order regardless of insertion order", async () => {
    const fast = await startFastAs(PEDRO);
    const later = "2026-07-26T18:00:00Z";
    const earlier = "2026-07-26T09:00:00Z";

    await call(PEDRO, "POST", `/api/fasts/${fast.id}/water`, { oz: 8.45, loggedAt: later });
    await call(PEDRO, "POST", `/api/fasts/${fast.id}/water`, { oz: 16.9, loggedAt: earlier });

    const me = (await (await call(PEDRO, "GET", "/api/me")).json()) as Me;
    expect(me.activeFast!.entries.map((e) => e.loggedAt)).toEqual([
      new Date(earlier).toISOString(),
      new Date(later).toISOString(),
    ]);
  });

  it("deletes an entry and drops the total", async () => {
    const fast = await startFastAs(PEDRO);
    const entry = (await (
      await call(PEDRO, "POST", `/api/fasts/${fast.id}/water`, { oz: 16.9 })
    ).json()) as WaterEntry;

    expect((await call(PEDRO, "DELETE", `/api/water/${entry.id}`)).status).toBe(204);

    const me = (await (await call(PEDRO, "GET", "/api/me")).json()) as Me;
    expect(me.activeFast!.totalOz).toBe(0);
  });

  it("refuses to log against a fast that has ended", async () => {
    const fast = await startFastAs(PEDRO);
    await call(PEDRO, "POST", `/api/fasts/${fast.id}/end`);

    const res = await call(PEDRO, "POST", `/api/fasts/${fast.id}/water`, { oz: 16.9 });
    expect(res.status).toBe(409);
  });
});

describe("per-user scoping", () => {
  it("will not let one person log water against another's fast", async () => {
    const soniasFast = await startFastAs(SONIA);
    await startFastAs(PEDRO);

    const res = await call(PEDRO, "POST", `/api/fasts/${soniasFast.id}/water`, { oz: 16.9 });
    expect(res.status).toBe(404);

    const me = (await (await call(SONIA, "GET", "/api/me")).json()) as Me;
    expect(me.activeFast!.entries).toHaveLength(0);
  });

  it("will not let one person delete another's entry", async () => {
    const soniasFast = await startFastAs(SONIA);
    const entry = (await (
      await call(SONIA, "POST", `/api/fasts/${soniasFast.id}/water`, { oz: 16.9 })
    ).json()) as WaterEntry;

    expect((await call(PEDRO, "DELETE", `/api/water/${entry.id}`)).status).toBe(404);

    const me = (await (await call(SONIA, "GET", "/api/me")).json()) as Me;
    expect(me.activeFast!.totalOz).toBe(16.9);
  });

  it("will not let one person end another's fast", async () => {
    const soniasFast = await startFastAs(SONIA);

    expect((await call(PEDRO, "POST", `/api/fasts/${soniasFast.id}/end`)).status).toBe(404);

    const me = (await (await call(SONIA, "GET", "/api/me")).json()) as Me;
    expect(me.activeFast).not.toBeNull();
  });
});

describe("GET /api/family", () => {
  it("shows other fasters and excludes the caller", async () => {
    const pedrosFast = await startFastAs(PEDRO);
    await startFastAs(SONIA);
    await call(PEDRO, "POST", `/api/fasts/${pedrosFast.id}/water`, { oz: 16.9 });
    await call(SONIA, "PATCH", "/api/me", { displayName: "Sonia" });

    const view = (await (await call(PEDRO, "GET", "/api/family")).json()) as FamilyView;

    expect(view.members).toHaveLength(1);
    expect(view.members[0]!.displayName).toBe("Sonia");
  });

  it("aggregates the other person's ounces without exposing their entry log or email", async () => {
    const soniasFast = await startFastAs(SONIA);
    await call(SONIA, "POST", `/api/fasts/${soniasFast.id}/water`, { oz: 16.9 });
    await call(SONIA, "POST", `/api/fasts/${soniasFast.id}/water`, { oz: 16.9 });
    await startFastAs(PEDRO);

    const view = (await (await call(PEDRO, "GET", "/api/family")).json()) as FamilyView;
    const member = view.members[0]!;

    expect(member.totalOz).toBe(33.8);
    expect(member.goalOz).toBe(144.9);
    // The wire shape is the contract — assert the exact key set so an added field has to be
    // a deliberate change to shared/types.ts rather than an accidental leak.
    expect(Object.keys(member).sort()).toEqual([
      "displayName",
      "goalOz",
      "startedAt",
      "targetEndAt",
      "totalOz",
    ]);
  });

  it("omits people whose fast has ended", async () => {
    const soniasFast = await startFastAs(SONIA);
    await startFastAs(PEDRO);
    await call(SONIA, "POST", `/api/fasts/${soniasFast.id}/end`);

    const view = (await (await call(PEDRO, "GET", "/api/family")).json()) as FamilyView;
    expect(view.members).toEqual([]);
  });

  it("reports zero ounces for someone who has not drunk yet", async () => {
    await startFastAs(SONIA);
    await startFastAs(PEDRO);

    const view = (await (await call(PEDRO, "GET", "/api/family")).json()) as FamilyView;
    expect(view.members[0]!.totalOz).toBe(0);
  });
});

describe("GET /api/me/stats", () => {
  const H = 3_600_000;

  async function statsFor(email: string): Promise<PersonalStats> {
    const res = await call(email, "GET", "/api/me/stats");
    expect(res.status).toBe(200);
    return res.json() as Promise<PersonalStats>;
  }

  it("is empty before any fast has been finished", async () => {
    await startFastAs(PEDRO); // in progress, so it must NOT count
    const stats = await statsFor(PEDRO);
    expect(stats.longest).toBeNull();
    expect(stats.fastsFinished).toBe(0);
    expect(stats.history).toEqual([]);
    expect(stats.totalFastedMs).toBe(0);
  });

  it("keeps a broken fast, measured by how long it actually ran", async () => {
    const fast = await startFastAs(PEDRO, 36);
    await call(PEDRO, "POST", `/api/fasts/${fast.id}/water`, { oz: 16.9 });
    await call(PEDRO, "POST", `/api/fasts/${fast.id}/end`); // at NOW — 12 h in

    const stats = await statsFor(PEDRO);
    expect(stats.fastsFinished).toBe(1);
    expect(stats.history).toHaveLength(1);

    const kept = stats.history[0]!;
    expect(kept.id).toBe(fast.id);
    expect(kept.durationMs).toBe(12 * H); // broken at 12 of a planned 36
    expect(kept.reachedTarget).toBe(false);
    expect(kept.totalOz).toBe(16.9);
    expect(stats.longest?.id).toBe(fast.id);
  });

  it("picks the longest across several, newest first in history", async () => {
    // Distinct starts: the earlier fast runs 30 h, the later one is broken at 12 h, so
    // "longest" and "newest" are deliberately different fasts.
    const earlyStart = new Date(START.getTime() - 48 * H);
    // Created with the clock back then too: a fast whose planned end is already in the past
    // is rejected at 400, which is correct and would otherwise fail this test obscurely.
    const created = await call(PEDRO, "POST", "/api/fasts", {
      hours: 36,
      goalOz: 144.9,
      startedAt: earlyStart.toISOString(),
    }, new Date(earlyStart.getTime() + H));
    expect(created.status).toBe(201);
    const early = (await created.json()) as Fast;
    await call(PEDRO, "POST", `/api/fasts/${early.id}/end`, undefined,
      new Date(earlyStart.getTime() + 30 * H));

    const recent = await startFastAs(PEDRO, 36);
    await call(PEDRO, "POST", `/api/fasts/${recent.id}/end`); // 12 h

    const stats = await statsFor(PEDRO);
    expect(stats.fastsFinished).toBe(2);
    expect(stats.longest?.id).toBe(early.id);
    expect(stats.longest?.durationMs).toBe(30 * H);
    expect(stats.totalFastedMs).toBe(42 * H);
    expect(stats.history.map((f) => f.id)).toEqual([recent.id, early.id]);
  });

  it("orders two fasts sharing a start instant the same way every read", async () => {
    // Reachable for real: end a fast, then start another backdated to the same instant.
    const first = await startFastAs(PEDRO, 36);
    await call(PEDRO, "POST", `/api/fasts/${first.id}/end`);
    const second = await startFastAs(PEDRO, 36);
    await call(PEDRO, "POST", `/api/fasts/${second.id}/end`,
      undefined, new Date(START.getTime() + 20 * H));

    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      seen.add((await statsFor(PEDRO)).history.map((f) => f.id).join(","));
    }
    expect(seen.size).toBe(1);
  });

  it("counts a fast carried to its planned first meal as reaching target", async () => {
    const fast = await startFastAs(PEDRO, 36);
    const atTarget = new Date(START.getTime() + 36 * H);
    await call(PEDRO, "POST", `/api/fasts/${fast.id}/end`, undefined, atTarget);

    const stats = await statsFor(PEDRO);
    expect(stats.reachedTargetCount).toBe(1);
    expect(stats.history[0]!.reachedTarget).toBe(true);
  });

  it("never shows one person's history to another", async () => {
    const pedros = await startFastAs(PEDRO, 36);
    await call(PEDRO, "POST", `/api/fasts/${pedros.id}/water`, { oz: 33.8 });
    await call(PEDRO, "POST", `/api/fasts/${pedros.id}/end`);

    const sonias = await statsFor(SONIA);
    expect(sonias.fastsFinished).toBe(0);
    expect(sonias.longest).toBeNull();
    expect(sonias.history).toEqual([]);

    // And Pedro still sees his own.
    expect((await statsFor(PEDRO)).fastsFinished).toBe(1);
  });

  it("401s without an identity, like every other route", async () => {
    const res = await handleApi(request("GET", "/api/me/stats"), {
      sql,
      now: () => NOW,
      resolveIdentity: async () => null,
    });
    expect(res?.status).toBe(401);
  });
});
