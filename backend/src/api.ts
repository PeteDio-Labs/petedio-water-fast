/**
 * The API surface. One exported `handleApi` so the routing table is readable top to bottom
 * and so tests can drive requests without binding a port.
 *
 * Shared rules:
 *  - Identity is resolved once, up front. No handler runs unauthenticated; a missing or bad
 *    JWT is a 401 for every route including reads.
 *  - `now` is passed in, never read inside handlers, so tests can drive a fast to any point
 *    in its window without waiting.
 *  - Response bodies come from `shared/types.ts`, which the frontend also imports — a shape
 *    change that only lands on one side fails to compile.
 */
import type { SQL } from "bun";
import type { Fast, FamilyView, Me, PersonalStats, WaterEntry } from "../../shared/types.ts";
import { db } from "./db.ts";
import {
  defaultDisplayName,
  summarizeFasts,
  validateDisplayName,
  validateLogWater,
  validateStartFast,
} from "./domain.ts";
import { resolveIdentity } from "./identity.ts";
import {
  ActiveFastExistsError,
  addWater,
  deleteWater,
  endFast,
  findOrCreateUser,
  getActiveFast,
  getFamily,
  getFinishedFasts,
  getOwnedFast,
  setDisplayName,
  startFast,
  type User,
} from "./store.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export interface ApiDeps {
  sql?: SQL;
  /** Injected so tests can place "now" anywhere in a fast's window. */
  now?: () => Date;
  /**
   * Identity resolver. Defaults to the real Cloudflare Access path; tests substitute one so
   * they can drive several distinct family members through the same handler and prove the
   * per-user scoping actually holds. `index.ts` passes no deps at all, so a deployed server
   * always uses the default — this seam cannot be reached from outside the process.
   */
  resolveIdentity?: (request: Request) => Promise<{ email: string } | null>;
}

/**
 * Routes an `/api/*` request. Returns null for paths this module doesn't own, letting the
 * caller fall through to static file serving.
 */
export async function handleApi(request: Request, deps: ApiDeps = {}): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  const sql = deps.sql ?? db();
  const now = deps.now?.() ?? new Date();

  const identity = await (deps.resolveIdentity ?? resolveIdentity)(request);
  if (!identity) {
    return error("Not authenticated", 401);
  }

  const user = await findOrCreateUser(
    identity.email,
    defaultDisplayName(identity.email),
    sql,
  );

  const path = url.pathname;
  const method = request.method.toUpperCase();

  // GET /api/me — the routing decision: active fast, or start-a-fast screen.
  if (path === "/api/me" && method === "GET") {
    return json(await buildMe(user, sql));
  }

  // GET /api/me/stats — personal records over finished fasts. Nobody else's data is
  // reachable from here; the query is scoped to this user like every other read.
  if (path === "/api/me/stats" && method === "GET") {
    const stats: PersonalStats = summarizeFasts(await getFinishedFasts(user.id, sql));
    return json(stats);
  }

  // PATCH /api/me — set the name the rest of the family sees.
  if (path === "/api/me" && method === "PATCH") {
    const parsed = validateDisplayName((await readJson(request) as { displayName?: unknown })?.displayName);
    if (!parsed.ok) return error(parsed.error, 400);
    await setDisplayName(user.id, parsed.value, sql);
    return json(await buildMe({ ...user, displayName: parsed.value }, sql));
  }

  // POST /api/fasts — begin a fast.
  if (path === "/api/fasts" && method === "POST") {
    const parsed = validateStartFast(await readJson(request), now);
    if (!parsed.ok) return error(parsed.error, 400);
    try {
      const fast = await startFast(user.id, parsed.value, sql);
      return json(fast, 201);
    } catch (err) {
      if (err instanceof ActiveFastExistsError) return error(err.message, 409);
      throw err;
    }
  }

  // GET /api/family — everyone else currently fasting.
  if (path === "/api/family" && method === "GET") {
    const view: FamilyView = { members: await getFamily(user.id, sql) };
    return json(view);
  }

  const fastEnd = path.match(/^\/api\/fasts\/([^/]+)\/end$/);
  if (fastEnd && method === "POST") {
    const closed = await endFast(user.id, decodeURIComponent(fastEnd[1]!), now, sql);
    if (!closed) return error("No active fast with that id", 404);
    return json(closed);
  }

  const fastWater = path.match(/^\/api\/fasts\/([^/]+)\/water$/);
  if (fastWater && method === "POST") {
    const fastId = decodeURIComponent(fastWater[1]!);
    const fast = await getOwnedFast(user.id, fastId, sql);
    // Same 404 whether the fast belongs to someone else or doesn't exist — a probe learns
    // nothing about other people's data from the status code.
    if (!fast) return error("No fast with that id", 404);
    if (fast.endedAt) return error("That fast is already over", 409);

    const parsed = validateLogWater(await readJson(request), now, new Date(fast.startedAt));
    if (!parsed.ok) return error(parsed.error, 400);

    const entry: WaterEntry | null = await addWater(user.id, fastId, parsed.value, "you", sql);
    if (!entry) return error("No fast with that id", 404);
    return json(entry, 201);
  }

  const waterEntry = path.match(/^\/api\/water\/([^/]+)$/);
  if (waterEntry && method === "DELETE") {
    const removed = await deleteWater(user.id, decodeURIComponent(waterEntry[1]!), sql);
    if (!removed) return error("No entry with that id", 404);
    return new Response(null, { status: 204 });
  }

  return error("Not found", 404);
}

async function buildMe(user: User, sql: SQL): Promise<Me> {
  const activeFast: Fast | null = await getActiveFast(user.id, sql);
  return { email: user.email, displayName: user.displayName, activeFast };
}
