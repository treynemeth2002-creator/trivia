# Live Trivia MVP

Live trivia tool for streamers: a host runs a session, viewers play along on
their phones, and an OBS overlay mirrors the game on stream. Built per the
spec in `CLAUDE.md`.

**Current status: Phase 3 (player flow built).** Hosts run the game from
`/host`; viewers open the Player Link on their phones, pick a nickname, and
play along — tap to lock in an answer during the countdown, see the reveal
with live percentage bars, get eliminated on a wrong/missed answer, and keep
spectating until the final survived/eliminated screen. The OBS overlay page
is the next phase.

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
see `packs/sample-pack.json` for the format. Each question has the text,
exactly 4 options, and which option index (0–3) is correct.

## Project layout

- `app/` — the web pages (host, player, and overlay views will live here)
- `lib/supabase.ts` — the shared database/realtime connection
- `supabase/schema.sql` — the database schema (paste into Supabase SQL Editor)
- `packs/` — question pack JSON files
- `CLAUDE.md` — the full build spec and constraints
