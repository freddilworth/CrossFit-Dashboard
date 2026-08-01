-- Extends pr_candidates (003_pr_candidates.sql) to support gymnastics PR candidates alongside
-- weightlifting ones.
--
-- Gymnastics PRs use a different measurement than weightlifting: total reps performed anywhere
-- within a single session, no weight/load concept and no rep-scheme concept (see CLAUDE.md). A
-- gymnastics candidate's one meaningful number — total reps — is stored in the existing `reps`
-- column (same field name as the in-memory JS candidate object); `weight` has no meaning for a
-- gymnastics row, hence the nullability change below (the reverse of what you might expect —
-- `reps` stays NOT NULL since every row, lift or gymnastics, always has one).
--
-- Additive/backward-compatible — existing 'lift' rows default category='lift' and keep their
-- non-null weight. Safe to run as a single block.

ALTER TABLE pr_candidates ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'lift';
ALTER TABLE pr_candidates ALTER COLUMN weight DROP NOT NULL;
