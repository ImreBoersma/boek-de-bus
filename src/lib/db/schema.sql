-- Boek de Bus — Postgres schema.
--
-- This is the real DDL. The running app currently talks to the in-memory stub in
-- `stub.ts` (see `index.ts` for how the implementation is chosen), so nothing
-- here has been executed yet. It is written to be applied as-is against a
-- Postgres 14+ database, and the stub is deliberately built to satisfy the same
-- invariants this file enforces.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- daterange exclusion below

-- Who may use the app. There is no self-signup: a row here is the invitation.
-- Sign-in is by emailed link, so there is no password column by design.
CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lower-cased; the app normalises before every read and write so that
  -- "Jan@example.com" and "jan@example.com" are the same person.
  email      text NOT NULL UNIQUE CHECK (email = lower(email)),
  name       text NOT NULL CHECK (length(btrim(name)) > 0),
  -- 'owner' books outright and decides on requests; 'guest' may only request.
  role       text NOT NULL CHECK (role IN ('owner', 'guest')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  destination text,
  note        text,
  status      text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  decided_by  uuid REFERENCES users (id) ON DELETE SET NULL,

  CONSTRAINT trips_dates_ordered CHECK (end_date >= start_date),
  -- A decision must record both when and by whom, or neither.
  CONSTRAINT trips_decision_complete CHECK (
    (status = 'pending' AND decided_at IS NULL AND decided_by IS NULL)
    OR (status <> 'pending' AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
  )
);

-- The important one. Approved trips may never overlap, and enforcing that here
-- rather than only in application code is what makes it actually true: two
-- concurrent approvals of overlapping requests cannot both commit. Pending
-- requests are excluded from the constraint because they are allowed to
-- overlap — that is the whole point of the request flow.
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_no_overlap;
ALTER TABLE trips ADD CONSTRAINT trips_no_overlap
  EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
  WHERE (status = 'approved');

-- The calendar reads "every trip that still matters" ordered by start date.
CREATE INDEX IF NOT EXISTS trips_start_date_idx ON trips (start_date)
  WHERE status IN ('pending', 'approved');

-- The owner screen reads the pending queue oldest-first.
CREATE INDEX IF NOT EXISTS trips_pending_created_idx ON trips (created_at)
  WHERE status = 'pending';

-- Single-use sign-in links.
CREATE TABLE IF NOT EXISTS login_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The SHA-256 of the token, never the token itself: a leaked database dump
  -- must not hand out live sign-in links.
  token_hash  text NOT NULL UNIQUE,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Consumption looks a token up by hash and checks it is unspent and unexpired.
CREATE INDEX IF NOT EXISTS login_tokens_user_idx ON login_tokens (user_id);
CREATE INDEX IF NOT EXISTS login_tokens_expiry_idx ON login_tokens (expires_at)
  WHERE consumed_at IS NULL;
