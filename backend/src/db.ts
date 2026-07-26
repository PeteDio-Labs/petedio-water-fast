/**
 * Postgres connection. Bun 1.2+ ships a Postgres client in core (`Bun.SQL`), so this
 * service has no database driver dependency — the same "no runtime deps we don't need"
 * line the palworld panel holds.
 */
import { SQL } from "bun";
import { DATABASE_URL } from "./config.ts";

export type Sql = SQL;

let client: SQL | undefined;

/** Lazily-constructed shared connection pool. */
export function db(): SQL {
  if (!client) {
    client = new SQL(DATABASE_URL);
  }
  return client;
}

/** Applies `schema.sql`. Idempotent — safe to run on every boot. */
export async function ensureSchema(sql: SQL = db()): Promise<void> {
  const ddl = await Bun.file(new URL("./schema.sql", import.meta.url)).text();
  await sql.unsafe(ddl);
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = undefined;
  }
}

/**
 * Postgres `numeric` arrives as a string over the wire (it is arbitrary-precision, so the
 * driver refuses to guess a float for you). Every ounce value in this app is a small
 * one-decimal number, so coercing is safe — but it has to happen deliberately at the read
 * boundary, or `oz + oz` silently becomes string concatenation.
 */
export function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

/** `timestamptz` comes back as a Date from Bun's driver; normalise to an ISO-8601 UTC string. */
export function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export function isoOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : iso(value);
}
