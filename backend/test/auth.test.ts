/**
 * The verifier must fail closed. These tests exist because the failure mode they guard
 * against — returning an identity when verification did not actually succeed — would hand
 * every family member's data to anyone who could reach the origin directly, and it would
 * look completely fine in the browser.
 */
import { describe, expect, it } from "bun:test";
import { resetJwksCache, verifyAccessJwt } from "../src/auth.ts";

const TEAM = "petedillo-labs.cloudflareaccess.com";
const AUD = "test-audience-tag";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://fast.pdlab.dev/api/me", { headers });
}

describe("verifyAccessJwt", () => {
  it("returns null when the Cf-Access-Jwt-Assertion header is absent", async () => {
    expect(await verifyAccessJwt(req(), TEAM, AUD)).toBeNull();
  });

  it("returns null for a token that is not a JWT at all", async () => {
    resetJwksCache();
    const r = await verifyAccessJwt(req({ "Cf-Access-Jwt-Assertion": "not-a-real-jwt" }), TEAM, AUD);
    expect(r).toBeNull();
  });

  it("returns null for a well-formed but unsigned token", async () => {
    resetJwksCache();
    // A syntactically valid JWT with alg:none and a real-looking email. If verification were
    // skipped or the signature ignored, this is exactly what would sail through.
    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=/g, "");
    const payload = btoa(
      JSON.stringify({ email: "attacker@example.com", iss: `https://${TEAM}`, aud: AUD }),
    ).replace(/=/g, "");
    const forged = `${header}.${payload}.`;

    expect(await verifyAccessJwt(req({ "Cf-Access-Jwt-Assertion": forged }), TEAM, AUD)).toBeNull();
  });

  it("returns null when the deployment is missing its Access configuration", async () => {
    resetJwksCache();
    const headers = { "Cf-Access-Jwt-Assertion": "anything" };

    expect(await verifyAccessJwt(req(headers), "", AUD)).toBeNull();
    expect(await verifyAccessJwt(req(headers), TEAM, "")).toBeNull();
  });

  it("never throws — callers rely on null being the only failure signal", async () => {
    resetJwksCache();
    // No whitespace-only entry: `Request` rejects that at construction per the fetch spec,
    // so such a header value can never reach the server in the first place.
    const nasty = ["", ".", "a.b.c", "..", "eyJhbGciOiJub25lIn0..", "x".repeat(10_000)];

    for (const token of nasty) {
      expect(await verifyAccessJwt(req({ "Cf-Access-Jwt-Assertion": token }), TEAM, AUD)).toBeNull();
    }
  });
});
