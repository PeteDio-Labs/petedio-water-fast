/**
 * Cloudflare Access identity verification.
 *
 * There is no login screen in this app. `fast.pdlab.dev` sits behind Cloudflare Access with
 * Authentik as the OIDC provider (petedio-iac `cloudflare-routes.tf`), so by the time a
 * request reaches this process the user has already authenticated against auth.pdlab.dev
 * and Cloudflare has stamped a signed JWT onto the request. All this module does is prove
 * that stamp is genuine and pull the email out of it.
 *
 * Ported from petedio-resume-builder's `src/lib/server/auth.ts` (same edge, same JWKS, same
 * fail-closed contract) with the SvelteKit `RequestEvent` swapped for a plain `Request`.
 *
 * This module does ONLY real verification — the development escape hatch lives in
 * `identity.ts`, so that neither this file nor its tests can be the thing that lets an
 * unauthenticated request through.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

export interface Identity {
  email: string;
}

// jose caches the JWKS response internally; keep one set per process so we don't refetch
// Cloudflare's JWKS on every request.
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getJwks(teamDomain: string) {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  }
  return jwks;
}

/** Test seam — drops the memoized JWKS so a test can swap team domains. */
export function resetJwksCache(): void {
  jwks = undefined;
}

/**
 * Verifies the `Cf-Access-Jwt-Assertion` header Cloudflare Access sets on requests to a
 * protected hostname.
 *
 * Fails closed: a missing header, missing configuration, a bad signature, a wrong issuer or
 * audience, an expired token, or a token with no email all return `null` rather than
 * throwing. Callers must treat `null` as "not authenticated" — there is no error variant to
 * accidentally interpret as success. The email is lowercased so it is a stable row key.
 */
export async function verifyAccessJwt(
  request: Request,
  teamDomain: string,
  audience: string,
): Promise<Identity | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;

  if (!teamDomain || !audience) {
    // Misconfigured deployment — fail closed rather than skip verification.
    console.error("verifyAccessJwt: CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not set");
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience,
    });

    if (typeof payload.email !== "string" || !payload.email) return null;
    return { email: payload.email.toLowerCase() };
  } catch (err) {
    console.error("verifyAccessJwt: JWT verification failed", err);
    return null;
  }
}
