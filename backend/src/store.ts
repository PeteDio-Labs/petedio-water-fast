/**
 * Every SQL statement in the service lives here, so the route handlers never build a query
 * and the scoping rules are all readable in one file.
 *
 * The scoping rule that matters: anything reachable by id (a fast, a water entry) is looked
 * up with `user_id` in the WHERE clause rather than fetched-then-checked. A caller who
 * guesses another family member's fast id gets "not found", and there is no code path where
 * an ownership check can be forgotten because the check *is* the query.
 */
import type { SQL } from "bun";
import type { Fast, FamilyMember, WaterEntry, WaterSource } from "../../shared/types.ts";
import { db, iso, isoOrNull, num } from "./db.ts";
import { sumOz } from "./domain.ts";
import type { LogWaterPlan, StartFastPlan } from "./domain.ts";

export interface User {
  id: string;
  email: string;
  displayName: string;
}

/**
 * Resolves the user row for an authenticated email, creating it on first sight.
 *
 * Auto-provisioning is safe here precisely because of where authentication happens: the
 * only way to reach this function is with an email out of a Cloudflare-signed JWT, and
 * Cloudflare only issues one to an address on the Access allow-list. The allow-list in
 * petedio-iac IS the user list — which is also why no email is hardcoded in this repo.
 */
export async function findOrCreateUser(
  email: string,
  displayName: string,
  sql: SQL = db(),
): Promise<User> {
  const rows = await sql`
    INSERT INTO users (email, display_name)
    VALUES (${email}, ${displayName})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email, display_name
  `;
  const row = rows[0];
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export async function setDisplayName(
  userId: string,
  displayName: string,
  sql: SQL = db(),
): Promise<void> {
  await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${userId}`;
}

async function entriesFor(fastId: string, sql: SQL): Promise<WaterEntry[]> {
  const rows = await sql`
    SELECT id, oz, logged_at, source
    FROM water_entries
    WHERE fast_id = ${fastId}
    ORDER BY logged_at ASC
  `;
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    oz: num(r.oz),
    loggedAt: iso(r.logged_at),
    source: String(r.source) as WaterSource,
  }));
}

async function hydrate(row: Record<string, unknown>, sql: SQL): Promise<Fast> {
  const entries = await entriesFor(String(row.id), sql);
  return {
    id: String(row.id),
    startedAt: iso(row.started_at),
    targetEndAt: iso(row.target_end_at),
    endedAt: isoOrNull(row.ended_at),
    goalOz: num(row.goal_oz),
    entries,
    totalOz: sumOz(entries),
  };
}

/** The user's in-flight fast, or null — this is what decides which page the app shows. */
export async function getActiveFast(userId: string, sql: SQL = db()): Promise<Fast | null> {
  const rows = await sql`
    SELECT id, started_at, target_end_at, ended_at, goal_oz
    FROM fasts
    WHERE user_id = ${userId} AND ended_at IS NULL
  `;
  return rows.length ? hydrate(rows[0], sql) : null;
}

export class ActiveFastExistsError extends Error {
  constructor() {
    super("You already have a fast in progress");
    this.name = "ActiveFastExistsError";
  }
}

/**
 * Starts a fast. Relies on the `fasts_one_active_per_user` partial unique index to reject a
 * concurrent second start, translating the constraint violation into a domain error rather
 * than checking first and hoping nothing interleaves.
 */
export async function startFast(
  userId: string,
  plan: StartFastPlan,
  sql: SQL = db(),
): Promise<Fast> {
  try {
    const rows = await sql`
      INSERT INTO fasts (user_id, started_at, target_end_at, goal_oz)
      VALUES (${userId}, ${plan.startedAt}, ${plan.targetEndAt}, ${plan.goalOz})
      RETURNING id, started_at, target_end_at, ended_at, goal_oz
    `;
    return hydrate(rows[0], sql);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ActiveFastExistsError();
    throw err;
  }
}

/**
 * Bun's Postgres driver exposes the SQLSTATE on `.code` for some errors and only inside the
 * message for others, so check both rather than trusting one shape. Matching the index name
 * keeps this from swallowing an unrelated unique violation as "you're already fasting".
 */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const message = err instanceof Error ? err.message : String(err);
  return (
    (code === "23505" || message.includes("23505") || message.includes("duplicate key")) &&
    message.includes("fasts_one_active_per_user")
  );
}

/** Ends the user's fast. Returns the closed fast, or null if they don't own an open one. */
export async function endFast(
  userId: string,
  fastId: string,
  endedAt: Date,
  sql: SQL = db(),
): Promise<Fast | null> {
  const rows = await sql`
    UPDATE fasts SET ended_at = ${endedAt}
    WHERE id = ${fastId} AND user_id = ${userId} AND ended_at IS NULL
    RETURNING id, started_at, target_end_at, ended_at, goal_oz
  `;
  return rows.length ? hydrate(rows[0], sql) : null;
}

/** Fetches a fast only if this user owns it. */
export async function getOwnedFast(
  userId: string,
  fastId: string,
  sql: SQL = db(),
): Promise<Fast | null> {
  const rows = await sql`
    SELECT id, started_at, target_end_at, ended_at, goal_oz
    FROM fasts
    WHERE id = ${fastId} AND user_id = ${userId}
  `;
  return rows.length ? hydrate(rows[0], sql) : null;
}

/**
 * Logs water against a fast the user owns. The ownership test is folded into the INSERT's
 * SELECT so a forged fast id inserts zero rows instead of writing to someone else's log.
 */
export async function addWater(
  userId: string,
  fastId: string,
  plan: LogWaterPlan,
  source: WaterSource = "you",
  sql: SQL = db(),
): Promise<WaterEntry | null> {
  const rows = await sql`
    INSERT INTO water_entries (fast_id, oz, logged_at, source)
    SELECT ${fastId}, ${plan.oz}, ${plan.loggedAt}, ${source}
    WHERE EXISTS (
      SELECT 1 FROM fasts WHERE id = ${fastId} AND user_id = ${userId} AND ended_at IS NULL
    )
    RETURNING id, oz, logged_at, source
  `;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    oz: num(r.oz),
    loggedAt: iso(r.logged_at),
    source: String(r.source) as WaterSource,
  };
}

/** Removes an entry the user owns (the `×` button). Returns false if it isn't theirs. */
export async function deleteWater(
  userId: string,
  entryId: string,
  sql: SQL = db(),
): Promise<boolean> {
  const rows = await sql`
    DELETE FROM water_entries
    WHERE id = ${entryId}
      AND fast_id IN (SELECT id FROM fasts WHERE user_id = ${userId})
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * The family strip: everyone *else* currently fasting.
 *
 * The projection is enforced in the SELECT list, not by deleting keys afterwards — email
 * and the entry log are never read out of the database for this view, so there is nothing
 * to accidentally serialise. Ounces are aggregated in SQL for the same reason.
 */
export async function getFamily(excludeUserId: string, sql: SQL = db()): Promise<FamilyMember[]> {
  const rows = await sql`
    SELECT u.display_name,
           f.started_at,
           f.target_end_at,
           f.goal_oz,
           COALESCE(SUM(w.oz), 0) AS total_oz
    FROM fasts f
    JOIN users u ON u.id = f.user_id
    LEFT JOIN water_entries w ON w.fast_id = f.id
    WHERE f.ended_at IS NULL AND f.user_id <> ${excludeUserId}
    GROUP BY u.display_name, f.started_at, f.target_end_at, f.goal_oz
    ORDER BY f.started_at ASC
  `;
  return rows.map((r: Record<string, unknown>) => ({
    displayName: String(r.display_name),
    startedAt: iso(r.started_at),
    targetEndAt: iso(r.target_end_at),
    totalOz: num(r.total_oz),
    goalOz: num(r.goal_oz),
  }));
}
