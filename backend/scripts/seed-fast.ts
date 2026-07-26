/**
 * Backfills a fast that was already underway before the app existed.
 *
 * Everything identifying is an argument, never a literal in this file — the repo is public,
 * and the family's email addresses have no business being committed to it.
 *
 * Usage (times are interpreted in the *server's* local timezone unless you pass a Z suffix):
 *
 *   bun scripts/seed-fast.ts \
 *     --email pedro@example.com \
 *     --name Pedro \
 *     --start "2026-07-26T00:00" \
 *     --hours 36 \
 *     --goal 144.9 \
 *     --water "16.9@2026-07-26T10:00,16.9@2026-07-26T13:00"
 *
 * Re-running for an email that already has an active fast is refused rather than creating a
 * second one — the partial unique index would reject it anyway, but the error is clearer here.
 */
import { closeDb, db, ensureSchema } from "../src/db.ts";
import { DEFAULT_GOAL_OZ } from "../../shared/types.ts";
import { defaultDisplayName, round1 } from "../src/domain.ts";
import { findOrCreateUser, getActiveFast, setDisplayName } from "../src/store.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requireArg(name: string): string {
  const value = arg(name);
  if (!value) {
    console.error(`Missing --${name}. See the usage comment at the top of this file.`);
    process.exit(1);
  }
  return value;
}

function parseInstant(raw: string, label: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    console.error(`${label} is not a valid date: ${raw}`);
    process.exit(1);
  }
  return d;
}

/** "16.9@2026-07-26T10:00,8.45@2026-07-26T15:30" → [{oz, at}, …] */
function parseWater(raw: string | undefined): { oz: number; at: Date }[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [ozRaw, atRaw] = chunk.split("@");
      if (!ozRaw || !atRaw) {
        console.error(`Bad --water entry "${chunk}" — expected <oz>@<timestamp>`);
        process.exit(1);
      }
      const oz = Number(ozRaw);
      if (!Number.isFinite(oz) || oz <= 0) {
        console.error(`Bad ounce value in "${chunk}"`);
        process.exit(1);
      }
      return { oz: round1(oz), at: parseInstant(atRaw, "--water timestamp") };
    });
}

const email = requireArg("email").toLowerCase();
const start = parseInstant(requireArg("start"), "--start");
const hours = Number(arg("hours") ?? 36);
const goalOz = Number(arg("goal") ?? DEFAULT_GOAL_OZ);
const name = arg("name") ?? defaultDisplayName(email);
const water = parseWater(arg("water"));

if (!Number.isFinite(hours) || hours <= 0) {
  console.error("--hours must be a positive number");
  process.exit(1);
}

const targetEnd = new Date(start.getTime() + hours * 3_600_000);

for (const entry of water) {
  if (entry.at < start) {
    console.error(
      `Water entry at ${entry.at.toISOString()} is before the fast start ${start.toISOString()}`,
    );
    process.exit(1);
  }
}

await ensureSchema();
const sql = db();

const user = await findOrCreateUser(email, name, sql);
await setDisplayName(user.id, name, sql);

const existing = await getActiveFast(user.id, sql);
if (existing) {
  console.error(
    `${email} already has an active fast (started ${existing.startedAt}). ` +
      "End it in the app first if you meant to replace it.",
  );
  await closeDb();
  process.exit(1);
}

// One transaction: a half-seeded fast (window written, water missing) is worse than none.
await sql.begin(async (tx) => {
  const rows = await tx`
    INSERT INTO fasts (user_id, started_at, target_end_at, goal_oz)
    VALUES (${user.id}, ${start}, ${targetEnd}, ${round1(goalOz)})
    RETURNING id
  `;
  const fastId = rows[0].id;

  for (const entry of water) {
    await tx`
      INSERT INTO water_entries (fast_id, oz, logged_at, source)
      VALUES (${fastId}, ${entry.oz}, ${entry.at}, 'seed')
    `;
  }
});

const seeded = await getActiveFast(user.id, sql);
console.log(
  `Seeded ${name} <${email}>: ${hours}h fast from ${start.toISOString()} ` +
    `to ${targetEnd.toISOString()}, ${seeded?.totalOz ?? 0} oz across ${water.length} entries.`,
);

await closeDb();
