# CrossFit Dashboard — Project Context

## What this is
A personal CrossFit workout tracking dashboard. Single-file Preact/HTM app with no build step (ESM CDN imports). Deployed on Vercel with serverless API functions and Supabase PostgreSQL.

## Stack
- `public/index.html` — entire frontend (Preact + HTM via CDN, no bundler)
- `api/parse.js` — Vercel serverless function; parses workout text via Anthropic API
- `api/generate.js` — Vercel serverless function; generates AI insights via Anthropic API
- `api/config.js` — Vercel serverless function; exposes safe config to frontend
- Supabase PostgreSQL via REST API (anon key in Vercel env vars)
- `ANTHROPIC_API_KEY` stored as Vercel environment variable only — never committed

## Design system (v4 palette)
- Coral Ember `#FF6B4A` — primary accent, active tab underline
- Ink `#2B2825` — primary text
- Warm Sand `#FDFBF6` — background
- Slate Gray `#9BA3AC` — secondary/muted text
- Logo gradient: `#FFA184` → `#FF765F` → `#FF5E4D`
- Fonts: **Inter** (body) + **Outfit** (header wordmark), loaded via Google Fonts
- Header: light background (`#FDFBF6`), stacked "CrossFit / Dashboard" wordmark, inline SVG logo mark
- MODS palette exceptions: weightlifting `#FFC145`, carries/holds `#A78BFA`

## AI model
Both `api/parse.js` and `api/generate.js` use `claude-haiku-4-5` (no date suffix needed).

## Deployment
Vercel. Push to `main` auto-deploys. GitHub PAT is embedded in the git remote URL — do not log or expose it.

## Live deployment
- Production URL: **https://crossfit-dashboard-eight.vercel.app**
- Supabase URL: `https://bpxajptyviarsgxbzpqr.supabase.co`
- Credentials for local data queries: read from `.env.local` (gitignored — never commit)
- To answer any question about live workout data, query Supabase directly rather than asking the user to look it up. Example:
  ```bash
  ANON_KEY=$(grep SUPABASE_ANON_KEY .env.local | cut -d= -f2)
  curl -s "https://bpxajptyviarsgxbzpqr.supabase.co/rest/v1/sessions?date=gte.2026-07-06&date=lte.2026-07-12" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
  ```

## Database schema (Supabase PostgreSQL)

**`sessions`** — one row per workout
- `id` (uuid), `date` (YYYY-MM-DD string)
- `blocks` (JSON array) — each block: `k` (type e.g. "metcon", "strength"), `mv` (raw text), `pm` (parsed movements array)
  - Each movement in `pm`: `n` (name), `r` (reps), `w` (weight lbs), `mod` (modality: "weightlifting"/"gymnastics"/"cardio"), `pat` (pattern: "squat"/"hinge"/"pull"/"push"/"carry"), `sub` (sub-pattern or null)
  - Tonnage for a movement = `r × w`. Pull tonnage = sum where `pat == "pull"`.

**`prs`** — personal records
- `id`, `category` ("lift" | "gymnastics" | "cardio"), `name`, `pr_value` (number), `pr_display` (string), `date`
- `history` (JSON array of `{d: date, v: value}`)

**`benchmarks`** — named benchmark workouts (Murph, Fran, etc.)
- `id`, `name`
- `scores` (JSON array of `{d: date, v: result string, note: string}`)

**`pr_candidates`** — auto-detected PR candidates awaiting user confirmation (migrations `003_pr_candidates.sql` + `004_gymnastics_pr_candidates.sql`, both applied to production)
- `id`, `session_id` (FK -> sessions, cascades on delete), `session_date`, `category` ("lift" | "gymnastics", defaults "lift"), `name` (matches `prs.name` convention), `reps`, `weight`, `status` ("pending" | "dismissed")
- For `category: "lift"`: `reps` = rep scheme (1/3/5), `weight` = lbs. For `category: "gymnastics"`: `reps` = total reps (the PR value itself, no rep-scheme concept), `weight` is null.
- Populated by the "Scan History for PRs" backfill button in the PRs tab (`scanPrHistory` + `scanGymnasticsPrHistory` in `public/index.html`); day-to-day detection right after logging a session is transient and only writes here on Dismiss, so a later backfill doesn't resurface it
- Lift detection (Phase 1): weightlifting lifts (`pat` in squat/hinge/push/pull, `mod === 'weightlifting'`) from `strength`/`accessory` blocks' explicit `sets` arrays, matched by movement + exact rep count (1/3/5 only — 2RM/10RM excluded as uncommon). Excludes complexes, DB/KB/sandbag implements, isolation work, single-leg variants, and a specific list of uncommon-to-PR lifts (see `PR_EXCLUDE_NAME`/`PR_EXCLUDE_NAMES` in `public/index.html`).
- Gymnastics detection (Phase 2): `mod === 'gymnastics'` movements — no weight/rep-scheme concept, so the PR metric is highest total reps for a movement performed anywhere within one session, summed across strength/accessory sets AND metcon reps (metcon reps count here, unlike lift detection). Excludes basic/ubiquitous bodyweight and core work plus assisted/added-load pull-up and dip variants (see `GYM_PR_EXCLUDE` in `public/index.html`); every burpee variation pools into one unified "Burpees" total (`gymCandidateName`/`rawGymnasticsReps`), matching the Home page's Burpees movement group. Cardio PR detection is a future phase.
- Auto-detected gymnastics PR names always carry a `" (Most in a Workout)"` suffix (see `gymCandidateName` in `public/index.html`) so they can never collide with a manually-entered PR of the same bare movement name — e.g. a hand-tracked "Toes to Bar: 33 unbroken" and an auto-detected "Toes to Bar (Most in a Workout): 180" coexist as separate `prs` rows instead of one silently overwriting the other. This is a real bug that happened once in production before the suffix was added — a big-volume metcon day was auto-confirmed as an "improvement" over a real unbroken-set PR, since both used the same bare name.
- Both categories require an existing confirmed PR to beat for day-to-day (post-submit) detection; the historical backfill scan surfaces a movement's single all-time-best value even with no prior baseline (relying on Dismiss, not stricter detection, to handle the occasional false positive — e.g. a one-off light/easy session).

## SaaS plans (in progress)
Owner is exploring turning this into a paid multi-user product. Key architecture needs: Supabase Auth (row-level security per user), Stripe subscriptions, per-user data isolation. Anthropic API billing is separate from Claude.ai — pay-as-you-go at console.anthropic.com, ~$0.12/user/month at current usage.
