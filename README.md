# Live Trivia MVP

Live trivia tool for streamers: a host runs a session, viewers play along on
their phones, and an OBS overlay mirrors the game on stream. Built per the
spec in `CLAUDE.md`.

**Current status: Phase 5 (polish pass done).** See `TESTING.md` for the
pilot-night checklist. Remaining: the real end-to-end test with people on
different devices and networks.

 All three views are in:
hosts run the game from `/host`, viewers play from the Player Link on their
phones, and the Overlay Link is a transparent browser source for
OBS/Streamlabs that mirrors the question, countdown, answer bars, and
survivor count on stream. Remaining: polish pass + end-to-end pilot test.

### Game options (chosen by the host when creating a session)
- **Ghost mode** — eliminated players keep answering for pride points.
- **Revival button** — host can bring everyone back mid-game for a hype reset.
- **Speed scoring** — faster correct answers earn more points (100-500);
  reveals call out the fastest player and the end screen shows a leaderboard.
- **Channel name** — optional; groups games into an all-time
  wins-per-nickname leaderboard at `/leaderboard/<channel>`.

**Existing databases:** paste `supabase/migration-game-settings.sql` into the
Supabase SQL Editor and Run it once to add these options.

### Adding the overlay to OBS
1. In OBS: Sources panel -> + -> **Browser**.
2. Paste the session's Overlay Link as the URL.
3. Set Width/Height to your canvas size (e.g. 1920 x 1080).
4. The background is transparent; the game panel sits in the lower third.

**If you set up the database during Phase 1:** paste
`supabase/migration-phase2.sql` into the Supabase SQL Editor and Run it once —
it adds the game-state columns the host flow needs. (Fresh installs that run
`schema.sql` get everything automatically.)

## One-time setup (you do these once, ~10 minutes)

### 1. Create a free Supabase project

1. Go to https://supabase.com and click **Start your project** (sign up with
   GitHub or email — the free tier needs no credit card).
2. Click **New project**. Name it anything (e.g. `live-trivia`), set a
   database password (save it somewhere, though you won't need it day-to-day),
   pick the region closest to you, and click **Create new project**.
3. Wait a minute or two while it provisions.

### 2. Create the database tables

1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Open the file `supabase/schema.sql` from this folder, copy **all** of it,
   paste it into the editor, and click **Run**.
3. Click **Table Editor** in the left sidebar. You should see four tables:
   `sessions`, `players`, `questions`, `answers`. If you do, the database
   is ready.

### 3. Connect this app to your Supabase project

1. In Supabase, click the gear icon (**Project Settings**) → **API**.
2. Copy two values: **Project URL** and the **anon public** key.
3. In this folder, copy `.env.local.example` to a new file named
   `.env.local` and paste those two values in. (These are the "publishable"
   values — they're designed to be visible in a browser, so this is safe.)

### 4. Run the app locally

In a terminal, from this `trivia/` folder:

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Test Supabase connection**. A green
"Connected!" box means Phase 1 is done.

## Question packs

Question packs live in `packs/` as plain JSON files you edit by hand —
see `packs/sample-pack.json` for the format. Three round types can be mixed
freely in one pack:

- **Trivia** (default): `text`, 4 `options`, `correct_option_index` (0-3).
  Wrong or missing answers are eliminated.
- **Majority**: `"type": "majority"`, `text`, 2-4 `options`. No right
  answer and nobody is eliminated — the crowd split is the entertainment.
  Picking with the majority earns 200 pts.
- **Closest guess**: `"type": "closest"`, `text`, `answer` (a number).
  Players type a number; the closest half of surviving players stays alive.
  Closest three earn 500/400/300 pts.

**Existing databases:** paste `supabase/migration-round-types.sql` into the
Supabase SQL Editor and Run it once to enable the new round types.

## Project layout

- `app/` — the web pages (host, player, and overlay views will live here)
- `lib/supabase.ts` — the shared database/realtime connection
- `supabase/schema.sql` — the database schema (paste into Supabase SQL Editor)
- `packs/` — question pack JSON files
- `CLAUDE.md` — the full build spec and constraints
