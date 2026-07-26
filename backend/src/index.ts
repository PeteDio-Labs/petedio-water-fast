/**
 * Service entry point: `Bun.serve` with the API in front and the built frontend behind it.
 * No Express, no separate web server — the same single-process shape as the palworld panel.
 */
import { handleApi } from "./api.ts";
import { assertConfig, DEV_IDENTITY, PORT, PUBLIC_DIR } from "./config.ts";
import { ensureSchema } from "./db.ts";

assertConfig();
await ensureSchema();

/**
 * Serves the SPA. Any unknown path returns index.html so a deep link or a refresh lands on
 * the app rather than a 404; real missing assets under a file extension still 404.
 */
async function serveStatic(pathname: string): Promise<Response> {
  if (!PUBLIC_DIR) return new Response("Not found", { status: 404 });

  const safe = pathname.replace(/\.\.+/g, "").replace(/^\/+/, "");
  if (safe) {
    const file = Bun.file(`${PUBLIC_DIR}/${safe}`);
    if (await file.exists()) return new Response(file);
    if (/\.[a-z0-9]+$/i.test(safe)) return new Response("Not found", { status: 404 });
  }

  const index = Bun.file(`${PUBLIC_DIR}/index.html`);
  if (await index.exists()) return new Response(index);
  return new Response("Not found", { status: 404 });
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 30,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return new Response("ok", { headers: { "content-type": "text/plain" } });
    }

    try {
      const apiResponse = await handleApi(request);
      if (apiResponse) return apiResponse;
    } catch (err) {
      // Log the detail, return a generic message — a stack trace or a Postgres error string
      // is not something to hand back over the wire.
      console.error(`${request.method} ${url.pathname} failed:`, err);
      return new Response(JSON.stringify({ error: "Something went wrong" }), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    return serveStatic(url.pathname);
  },
});

console.log(`water-fast listening on :${server.port}`);
if (DEV_IDENTITY) {
  console.warn(
    `⚠  WATERFAST_DEV_IDENTITY is active — every request is treated as ${DEV_IDENTITY}. ` +
      "Development only.",
  );
}
