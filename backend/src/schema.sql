-- water-fast schema. Applied on boot (idempotent), which is enough for an app this size —
-- there is no migration tool here on purpose. If a change ever needs to be destructive,
-- write it as an explicit numbered migration rather than editing these statements.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lowercased at the application boundary; the CHECK stops a stray mixed-case row from
  -- creating a second account for the same human.
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fasts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  started_at     timestamptz NOT NULL,
  target_end_at  timestamptz NOT NULL,
  ended_at       timestamptz,
  goal_oz        numeric(5, 1) NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fasts_window_ordered CHECK (target_end_at > started_at)
);

-- One active fast per person, enforced by the database rather than by a read-then-write in
-- application code: two taps of "start fast" from a flaky phone connection would otherwise
-- race past any check we did in TypeScript and leave two open fasts.
CREATE UNIQUE INDEX IF NOT EXISTS fasts_one_active_per_user
  ON fasts (user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS fasts_user_started ON fasts (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS water_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fast_id    uuid NOT NULL REFERENCES fasts (id) ON DELETE CASCADE,
  oz         numeric(4, 1) NOT NULL CHECK (oz > 0 AND oz <= 300),
  logged_at  timestamptz NOT NULL,
  source     text NOT NULL DEFAULT 'you' CHECK (source IN ('you', 'seed'))
);

CREATE INDEX IF NOT EXISTS water_entries_fast ON water_entries (fast_id, logged_at);
