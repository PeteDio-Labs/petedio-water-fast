/**
 * Resolves the caller's identity for a request — the one place the development escape hatch
 * is allowed to exist, kept out of `auth.ts` so the real verifier stays unconditional.
 *
 * The ordering below is deliberate: the dev override is checked first and returns
 * immediately, but `config.assertConfig()` has already refused to boot if that override is
 * set under NODE_ENV=production. So in a deployed service this function is exactly
 * `verifyAccessJwt`, and there is no code path that reaches the override.
 */
import { CF_ACCESS_AUD, CF_ACCESS_TEAM_DOMAIN, DEV_IDENTITY, IS_PRODUCTION } from "./config.ts";
import { verifyAccessJwt, type Identity } from "./auth.ts";

export async function resolveIdentity(request: Request): Promise<Identity | null> {
  if (DEV_IDENTITY && !IS_PRODUCTION) {
    return { email: DEV_IDENTITY.toLowerCase() };
  }
  return verifyAccessJwt(request, CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD);
}
