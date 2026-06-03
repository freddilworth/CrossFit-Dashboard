# CrossFit Dashboard

Personal CrossFit workout tracker with volume analytics, movement pattern tracking, tonnage monitoring, and PR management.

Type your workout in plain English, hit submit, and the dashboard updates on the spot.

## Architecture

- Frontend: Static HTML + Preact (no build step)
- API: Vercel serverless function calling Claude Haiku to parse workouts (~$0.001/workout)
- Database: Supabase (free tier, 50k rows)

## Setup (15 minutes)

### Step 1: Create a Supabase project

1. Go to https://supabase.com and create a free account
2. Click "New Project", pick a name and password, choose a region near you
3. Once created, go to **SQL Editor** (left sidebar)
4. Open the `seed.sql` file from this project, copy its entire contents, paste into the SQL editor, and click **Run**
5. Go to **Settings > API** (left sidebar under Configuration)
6. Copy the **Project URL** (looks like `https://abc123.supabase.co`)
7. Copy the **anon public** key (the long string under "Project API keys")

### Step 2: Get an Anthropic API key

1. Go to https://console.anthropic.com
2. Create an API key (or use an existing one)
3. You will only be charged ~$0.001 per workout parsed

### Step 3: Deploy to Vercel

1. Push this project folder to a new GitHub repository
2. Go to https://vercel.com and sign up with GitHub (free)
3. Click "Import Project" and select your repo
4. Under **Environment Variables**, add these three:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon public key |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

5. Click Deploy
6. Vercel gives you a URL like `copper-crossfit.vercel.app`
7. Bookmark it

### Step 4: Use it

Open your URL. Type a workout. Hit Submit. Done.

## How to log workouts

Type however you want. Examples:

```
Front squat
1x5 - 185
2x5 - 205

10 min AMRAP
12 Cal Ski
12 DB Hang Snatch (50)
24 Double unders
12 SA DB Thruster (50)
Score: 3+24 Rx
```

Or more casually:

```
Did back squats, worked up to 315x2. Then a 20 min EMOM:
odd mins 15 cal row, even mins 12 DB bench 50. Score all rounds completed.
```

The AI parser handles both styles.
