-- Adds the pr_candidates table: auto-detected PR candidates awaiting user confirmation.
--
-- Two producers write here:
--   1. The historical backfill scan (PRs tab "Scan History for PRs") — inserts one row per
--      movement+rep-scheme the scan finds exceeding the running-best at that point in time.
--   2. The inline day-to-day flow, but ONLY on dismiss — confirming a same-session candidate
--      writes straight to `prs` and never touches this table at all, since there's nothing to
--      remember afterward. Dismissing one here records status='dismissed' so a later backfill
--      scan (which walks ALL sessions again) doesn't re-surface something the user already said
--      no to for that exact session + movement + rep count.
--
-- This is a new table (not altering existing data), so unlike 002_multi_tenant.sql this is safe
-- to run as a single block — no phased rollout needed.

CREATE TABLE IF NOT EXISTS pr_candidates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  name text NOT NULL,        -- matches prs.name convention, e.g. "Back Squat" or "5RM Back Squat"
  reps integer NOT NULL,
  weight numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- 'pending' | 'dismissed' (confirmed candidates are deleted — prs is the source of truth once confirmed)
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, session_id, name)
);

ALTER TABLE pr_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pr_candidates" ON pr_candidates
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
