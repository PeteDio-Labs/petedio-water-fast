# petedio-water-fast

A water-fasting tracker for the Delgadillo family. You sign in through Authentik, and the
app either shows the fast you're already in — countdown to your first meal, water logged,
who else is fasting with you — or offers to start one.

Public at **`fast.pdlab.dev`**, running natively on **LXC 243 (`waterfast-243`)**, with data
in the `waterfast` database on **postgres-rds-231**.

> Grew out of a single-file HTML mock that stored one hardcoded fast in browser storage.
> The layout — the water column, the countdown, the timeline, the bottle buttons — is
> deliberately carried over; what's new is that it's per-user, persisted, and shared.

## Stack

- **Backend** — Bun only (`bun install/run/test`). Plain `Bun.serve`, no Express. Postgres
  via `Bun.SQL`, which is built into Bun, so the only runtime dependency is `jose` for JWT
  verification. Native `fetch`.
- **Frontend** — Preact + TypeScript + Vite. Two bundles: `index.html` (the app) and
  `demo.html` (the same app against an in-memory backend, for review — never served in
  production).
- **`shared/types.ts`** is imported by *both* sides, so an API shape change that only lands
  on one end fails to compile instead of producing a blank page.

## Sign-in — there is no login screen

Authentication happens entirely at the edge, the same way the Palworld panel does it:

```
browser → Cloudflare Access (fast.pdlab.dev) → Authentik (auth.pdlab.dev) → back
        → Cloudflare stamps Cf-Access-Jwt-Assertion → this app verifies it
```

`backend/src/auth.ts` verifies that JWT against Cloudflare's JWKS and pulls out the email.
It **fails closed** — a missing header, missing config, bad signature, wrong issuer or
audience, or an expired token all return `null`, and every route 401s. There is no error
path a caller could mistake for success.

Two consequences worth knowing:

- **The Cloudflare Access allow-list is the user list.** A user row is created on first
  authenticated request, so nobody needs provisioning in this app. The allow-list lives in
  petedio-iac's `cloudflare-routes.tf` — which is also why no email address appears in this
  repo.
- **Adding a family member is an infrastructure change plus an Authentik account**, not a
  code change. See below.

## Data model

| table | what |
|---|---|
| `users` | one row per email, auto-created on first sign-in |
| `fasts` | start, planned first meal, water goal, and `ended_at` (null while active) |
| `water_entries` | ounces + timestamp, `source` distinguishing `you` from backfilled `seed` |

The partial unique index `fasts_one_active_per_user` (on `user_id WHERE ended_at IS NULL`)
is what enforces one fast at a time — in the database, not in a read-then-write check that a
double-tapped button could race past.

## API

All routes require a verified identity and are scoped to the caller.

| | |
|---|---|
| `GET /api/me` | email, display name, and the active fast (or `null` — this is what picks the page) |
| `PATCH /api/me` | set the display name the family strip shows |
| `POST /api/fasts` | start a fast — `{ hours, goalOz, startedAt? }` |
| `POST /api/fasts/:id/end` | break or finish it |
| `POST /api/fasts/:id/water` | log `{ oz, loggedAt? }` |
| `DELETE /api/water/:id` | remove an entry |
| `GET /api/family` | everyone *else* currently fasting — name, window, ounces. No entry log, no email. |

Ownership is enforced by putting `user_id` in the WHERE clause rather than fetching and then
checking, so there is no handler where the check can be forgotten.

## Local development

```bash
bun install
docker run -d --name waterfast-pg -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=waterfast_test -p 55432:5432 postgres:16-alpine
cp .env.example backend/.env
```

Then either run the whole thing:

```bash
cd frontend && bun run build && cd ../backend && bun run dev
```

…or skip the backend entirely and open **`demo.html`** (`cd frontend && bun run dev`, then
`/demo.html`) — the full UI against mock data, with a switcher for the mid-fast and
no-fast-yet states. That's the fastest way to review a design change.

`WATERFAST_DEV_IDENTITY` stands in for Cloudflare Access locally. The server **refuses to
start** if it's set with `NODE_ENV=production`.

## Verify before done

```bash
cd backend && bun test        # needs the Postgres container above
cd frontend && bun run build  # runs tsc --noEmit first
```

## Seeding a fast that started before the app existed

```bash
cd backend
bun scripts/seed-fast.ts \
  --email someone@example.com --name Someone \
  --start "2026-07-26T00:00" --hours 36 --goal 144.9 \
  --water "16.9@2026-07-26T10:00,16.9@2026-07-26T13:00"
```

Times without a `Z` are read in the server's local timezone. Entries land with
`source = 'seed'` so they're distinguishable in the log. Re-running for someone who already
has an active fast is refused.

## Adding a family member (operator)

Both steps are manual and both are yours — the automation never mutates the Authentik box
(see the note in petedio-iac's `cloudflare-oidc.tf`), and account creation isn't something
to script against an SSO server.

1. **Authentik** (`auth.pdlab.dev`, LXC 119) → create the user with the email they'll use.
   Send them an email-based set-password invite rather than setting a password yourself.
2. **petedio-iac** → add the same address to `access_emails` for `fast.pdlab.dev` in
   `cloudflare-routes.tf`, then apply.

The address must match in both places. Authentik authenticates; the Cloudflare allow-list
authorizes — so a mismatch produces a successful login followed by a denial, which is a
confusing failure to debug after the fact.

## Deployment

Native Bun systemd service on LXC 243, provisioned by petedio-iac's
`ansible/playbooks/configure-water-fast.yml`. Config — the database password and the
Cloudflare Access team domain and AUD — comes from Vault (`kv/services/water-fast`) at
deploy time. Nothing sensitive lives in this repo.

## Source of truth

Tracked in Linear (team `PeteDillo`). Infrastructure — the LXC, the database, the tunnel
route — lives in **petedio-iac**, not here.
