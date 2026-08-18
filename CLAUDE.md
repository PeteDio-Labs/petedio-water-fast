# petedio-water-fast (Agent Context)

Water-fasting tracker for the Delgadillo family (Pedro, Sonia, Michelle, Marcos). Public at
`fast.pdlab.dev`, native Bun service on **LXC 243 (`waterfast-243`)**, data in the
`waterfast` DB on **postgres-rds-231**. Grew out of a single-file HTML mock — the layout is
carried over deliberately.

## Stack & rules

- **Bun only** (`bun install/run/test`). Never npm/yarn/pnpm. Native `fetch`.
- **Backend**: plain `Bun.serve`, no Express. Postgres via **`Bun.SQL`** (built into Bun —
  do not add a driver). The only runtime dep is `jose`; keep it that way if you can.
- **Frontend**: Preact + TS + Vite. Two entries — `index.html` (production) and `demo.html`
  (mock backend, review-only). Glass material is ported from petedio-palworld-panel's
  `styles/tokens.css`; keep them recognisably the same system.
- **`shared/types.ts` is the contract**, imported by both sides. Edit it *first* when a
  response shape changes, then fix whichever side the compiler flags. This is the guard
  against the DTO drift described in the workspace `.agent/lessons.md` (2026-06-06).
- Trunk-based: `main` + `pet-<n>-<slug>` → PR → squash-merge; mention `PET-<n>`.

## Key facts (don't re-derive)

- **There is no login screen and there must not be one.** Cloudflare Access + Authentik
  authenticate at the edge; `src/auth.ts` verifies the `Cf-Access-Jwt-Assertion` JWT and
  **fails closed** (null on any problem). Ported from petedio-resume-builder's
  `src/lib/server/auth.ts`.
- **The CF Access allow-list is the user list** — users auto-provision on first
  authenticated request. No email addresses belong in this repo (it is public). Adding a
  person = an Authentik account + an `access_emails` entry in petedio-iac.
- `WATERFAST_DEV_IDENTITY` is the local escape hatch. It lives in `identity.ts`, never in
  `auth.ts`, and `config.assertConfig()` refuses to boot if it's set under
  `NODE_ENV=production`. Don't move it or soften that check.
- **One active fast per user is a database constraint** (`fasts_one_active_per_user`, a
  partial unique index), not an application check — a double-tapped start would race past
  anything done in TypeScript. `startFast` translates the violation into a 409.
- **Ownership is enforced in the WHERE clause**, not by fetch-then-check. Keep it that way;
  it's why there's no route that can forget the check.
- Postgres `numeric` arrives as a **string** — `db.ts`'s `num()` coerces at the read
  boundary. Drop it and ounce totals become string concatenation.
- All instants on the wire are **ISO-8601 UTC**; the browser renders local.

## Files

- `shared/types.ts` — the API contract. Start here.
- `backend/src/`: `config.ts` (env + boot assertions), `auth.ts` (JWT verify only),
  `identity.ts` (resolver + dev hatch), `db.ts` (Bun.SQL + coercion), `schema.sql`,
  `domain.ts` (pure logic — all of it unit-tested), `store.ts` (every SQL statement),
  `api.ts` (routes), `index.ts` (`Bun.serve` + static).
- `backend/scripts/seed-fast.ts` — backfill a fast that predates the app. Args only, no
  literals.
- `frontend/src/`: `lib/` (api/clock/format/mock — no JSX), `components/` (glass primitives),
  `app/` (App, StatPage, StartFastPage, and the pieces of the stat page).

## Verify before done

`cd backend && bun test` — needs Postgres:

```bash
docker run -d --name waterfast-pg -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=waterfast_test -p 55432:5432 postgres:16-alpine
```

`cd frontend && bun run build` (runs `tsc --noEmit` first).

For behaviour, **drive it in a browser** — `frontend/dist/demo.html` for the UI alone, or
build the frontend and run the backend with `PUBLIC_DIR=../frontend/dist` for the real
thing. A green suite is not proof the page works; that lesson is in the workspace
`.agent/lessons.md` and it has already caught a bug in this repo.

## Source of truth

- **Linear** (`PeteDillo`/`PET`) — issues and plans.
- **petedio-iac** — the LXC, the database, the tunnel route, the Ansible deploy. Infra
  changes go there, never here.

## Writing style

Write in **Google developer documentation style** — the standing default for prose
in this repo: PR descriptions, commit bodies, work-item comments, docs, and code
comments.

- **Second person.** The reader is *you*; use *I* for yourself, never *we* for the reader.
- **Active voice.** Name who does the thing.
- **Conditions before instructions:** *To rebuild the index, run X* — not *Run X if
  you want to rebuild the index.*
- **Answer first**, detail after.
- **Cut filler:** *just*, *simply*, *easy*, *please note*, *in order to*. Never call
  something easy.
- **No time-anchored words** in durable prose: *currently*, *new*, *now*, *latest*,
  *existing*.
- **Sentence case** headings; code font for paths, commands, flags, and `PET-<n>` keys.
- Sentences under 26 words. Write *lets you* not *allows you to*, *run* not *execute*.

This governs how sentences are written, not how many. Don't restyle prose you aren't
already editing.
