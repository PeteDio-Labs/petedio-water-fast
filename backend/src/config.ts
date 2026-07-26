/**
 * Environment for the water-fast service. Read once at import so a misconfigured deploy
 * fails at boot rather than on the first request that happens to need the missing value.
 */

/** Postgres connection string — the `waterfast` DB on postgres-rds-231 in production. */
export const DATABASE_URL = process.env.DATABASE_URL ?? "";

export const PORT = Number(process.env.PORT ?? 8080);

/** Directory holding the built frontend (`frontend/dist`). Empty → API only. */
export const PUBLIC_DIR = process.env.PUBLIC_DIR ?? "";

/** Cloudflare Access team domain, e.g. "petedillo-labs.cloudflareaccess.com" (no protocol). */
export const CF_ACCESS_TEAM_DOMAIN = process.env.CF_ACCESS_TEAM_DOMAIN ?? "";

/** The Access application's Audience (AUD) tag. */
export const CF_ACCESS_AUD = process.env.CF_ACCESS_AUD ?? "";

/**
 * Local-development escape hatch: when set, every request is treated as coming from this
 * email instead of verifying a Cloudflare Access JWT. It exists so the app can be driven
 * without an edge in front of it.
 *
 * This is the single most dangerous variable in the service, so it is fenced twice:
 * `assertConfig()` below refuses to boot if it is set while NODE_ENV=production, and the
 * real verifier in auth.ts has no knowledge of it at all (same split resume-builder uses —
 * the escape hatch never lives in the module that does the verifying).
 */
export const DEV_IDENTITY = process.env.WATERFAST_DEV_IDENTITY ?? "";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Validates the environment at boot. Throws — a service that cannot authenticate anyone,
 * or one that would accept a forged identity, must not start and serve traffic.
 */
export function assertConfig(): void {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  if (DEV_IDENTITY && IS_PRODUCTION) {
    throw new Error(
      "WATERFAST_DEV_IDENTITY is set with NODE_ENV=production — refusing to start. " +
        "This would let any request impersonate a user without Cloudflare Access.",
    );
  }

  if (!DEV_IDENTITY && (!CF_ACCESS_TEAM_DOMAIN || !CF_ACCESS_AUD)) {
    throw new Error(
      "CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set (no WATERFAST_DEV_IDENTITY " +
        "fallback is active) — otherwise every request would fail authentication.",
    );
  }
}
