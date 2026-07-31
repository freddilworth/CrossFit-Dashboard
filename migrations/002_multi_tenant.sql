-- Multi-tenant migration: adds user_id + real per-user RLS to sessions, prs, benchmarks.
--
-- RUN THESE STEPS IN ORDER, ONE BLOCK AT A TIME, IN THE SUPABASE SQL EDITOR.
-- Do NOT paste the whole file at once. Step 3 requires you to paste in your own
-- user UUID before continuing.
--
-- IMPORTANT — Steps 1-5 are safe to run against your still-deployed OLD frontend
-- (it doesn't send a login token, but the wide-open "allow all" policies don't
-- care, so it keeps working through all of them). Step 6 is different: it's the
-- step that actually starts enforcing per-user isolation, and the old frontend
-- has no session token at all — so if Step 6 runs while the old code is still
-- what's live, your dashboard will suddenly render EMPTY (not deleted, just
-- inaccessible via the API until you're logged in with the new code). See the
-- "STOP" block right before Step 6 below — do not skip it.
--
-- PREREQUISITE — do this in the Supabase Dashboard UI, not SQL:
--   Authentication -> Users -> Invite User -> enter your own email.
--   Click the emailed invite link, set a password. This only creates your
--   auth.users row — it does not touch sessions/prs/benchmarks at all, so
--   your existing workout data is completely unaffected by this step.

-- ── STEP 1: add nullable user_id columns ──────────────────────────────
ALTER TABLE sessions   ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE prs        ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE benchmarks ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- ── STEP 2: find your user UUID ────────────────────────────────────────
-- Run this separately and copy the "id" column for your own email:
-- SELECT id, email FROM auth.users;

-- ── STEP 3: backfill existing rows to your UUID ────────────────────────
-- Replace 'REPLACE_WITH_YOUR_USER_UUID' below with the value from Step 2.
UPDATE sessions   SET user_id = 'REPLACE_WITH_YOUR_USER_UUID' WHERE user_id IS NULL;
UPDATE prs        SET user_id = 'REPLACE_WITH_YOUR_USER_UUID' WHERE user_id IS NULL;
UPDATE benchmarks SET user_id = 'REPLACE_WITH_YOUR_USER_UUID' WHERE user_id IS NULL;

-- Verify zero rows remain unassigned before continuing (expect 0 for all three):
-- SELECT count(*) FROM sessions WHERE user_id IS NULL;
-- SELECT count(*) FROM prs WHERE user_id IS NULL;
-- SELECT count(*) FROM benchmarks WHERE user_id IS NULL;

-- ── STEP 4: enforce NOT NULL + default new rows to the logged-in user ──
ALTER TABLE sessions   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE prs        ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE benchmarks ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE sessions   ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE prs        ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE benchmarks ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ── STEP 5: replace global unique constraints with per-user composites ─
-- Two different users must be able to log a session on the same date, or
-- have PRs/benchmarks with the same name. These are the auto-generated
-- constraint names from seed.sql's original UNIQUE(date) / UNIQUE(category,
-- name) / UNIQUE(name). If unsure, confirm with \d sessions / \d prs /
-- \d benchmarks first — DROP ... IF EXISTS makes a wrong guess harmless,
-- but a wrong guess also silently leaves the old global constraint in place.
DROP INDEX IF EXISTS sessions_date_idx;
ALTER TABLE prs        DROP CONSTRAINT IF EXISTS prs_category_name_key;
ALTER TABLE benchmarks DROP CONSTRAINT IF EXISTS benchmarks_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_user_date_idx ON sessions(user_id, date);
ALTER TABLE prs        ADD CONSTRAINT prs_user_category_name_key UNIQUE (user_id, category, name);
ALTER TABLE benchmarks ADD CONSTRAINT benchmarks_user_name_key UNIQUE (user_id, name);

-- ── STOP — do not run Step 6 yet ────────────────────────────────────────
-- Before continuing, confirm ALL of the following are true:
--   1. Steps 1, 3, 4, 5 above are done, and the zero-row verification
--      queries under Step 3 actually returned 0 for all three tables.
--   2. The NEW app code (supabase-js auth, login screen, api/invite.js)
--      is pushed and deployed to Vercel — not just sitting locally.
--   3. SUPABASE_SERVICE_ROLE_KEY and ADMIN_EMAIL are set in the Vercel
--      dashboard's environment variables (Production).
--   4. You've opened the LIVE deployed site, logged in with the account
--      from the prerequisite step, and confirmed your existing sessions/
--      PRs/benchmarks show up correctly.
-- Only once all four are true should you run Step 6. If you run it while
-- the OLD (no-auth) code is still what's live, that old code has no login
-- session to satisfy `user_id = auth.uid()`, and your dashboard will
-- render empty until the new code is deployed and you're logged in —
-- your data isn't deleted, but it will look alarmingly like it vanished.

-- ── STEP 6: drop wide-open policies, add real per-user RLS ─────────────
-- RLS itself is already ENABLED on all three tables (seed.sql) — only the
-- policies change here.
DROP POLICY IF EXISTS "Allow all on sessions"   ON sessions;
DROP POLICY IF EXISTS "Allow all on prs"        ON prs;
DROP POLICY IF EXISTS "Allow all on benchmarks" ON benchmarks;

CREATE POLICY "Users manage own sessions" ON sessions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage own prs" ON prs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage own benchmarks" ON benchmarks
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── STEP 7 (do this after Step 6, in the Dashboard UI) ──────────────────
-- Restrict new signups so random people can't self-register:
--   Authentication -> Providers -> Email -> disable "Allow new users to sign up"
-- (Invited users can still set a password via the invite link — this only
-- blocks the public /auth/v1/signup path.)
