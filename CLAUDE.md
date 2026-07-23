# Live Trivia MVP — Build Spec for Claude Code

Paste this whole document as your first message to Claude Code, or save it as `CLAUDE.md` in your project folder so it reads it automatically every session.

---

## 1. Project Context (read this first)

I'm building a live trivia tool for streamers, inspired by HQ Trivia but fixed for the problems that killed it: no VC-subsidized cash prizes, no massive live infrastructure needed on day one, and content built around a specific streamer's community instead of generic trivia.

The goal right now is **not** to build a platform for a huge streamer. It's to build the smallest possible working version I can pilot live with one smaller streamer's community, to prove people actually come back for a second session. Everything below should be scoped to that reality.

**I have roughly $100 in usage credits for this build. Treat that as a hard constraint, not a suggestion.** Flag anything that risks blowing through it before you do it.

---

## 2. Budget & Scope Guardrails (follow these before writing any code)

- Default to Sonnet for routine coding tasks. Only use a stronger model if I explicitly ask for it on something genuinely hard (e.g. debugging a nasty realtime sync bug).
- Use free-tier services only. No paid APIs, no paid hosting, no paid database tier, unless I explicitly approve it first.
- Build in the phases below, in order. Stop and show me working Phase 1 before touching Phase 2. Do not build ahead of where we are.
- No large refactors or "let me redo this more elegantly" passes unless something is actually broken. Working and ugly beats elegant and expensive.
- Before installing any new package, dependency, or service, tell me what it is and why, especially if it has any paid tier I could accidentally trigger.
- Commit to git frequently so nothing is ever lost to a bad session.
- If a task is going to take a lot of back-and-forth or token spend, tell me before starting so I can decide if it's worth it.

---

## 3. What We're Building (Phase 1 — the only thing to build right now)

A live trivia session tool with three connected views, all showing the same live state in real time:

1. **Host view** — the streamer (or me, standing in for them during testing) controls the session.
2. **Player view** — a mobile-friendly web page viewers open on their phone to play along.
3. **Overlay view** — a transparent browser-source page for OBS/Streamlabs that shows the question and live results on the stream itself.

No app download required for anyone. No Twitch account linking required for v1. Just links.

### Host Flow
1. Host goes to `/host`, creates a new session: names it, picks a question pack (a simple JSON file of questions to start, no admin CMS needed yet), sets expected player count.
2. Host gets two shareable links: a **Player Link** and an **Overlay Link** (for OBS).
3. Host sees a waiting room with a live count of players who've joined.
4. Host clicks Start. First question broadcasts to all connected players and the overlay simultaneously, with an 8-10 second countdown.
5. When the timer ends, host sees results reveal automatically (correct answer highlighted, live answer distribution, survivor count). Host clicks Next to move on, or set auto-advance.
6. After the last question, host sees a final survivor list they can screenshot or export, to manually handle payout (bits, channel points, whatever they've set up) — no payment processing in this build.

### Player Flow
1. Viewer clicks the Player Link, enters a nickname (no account, no signup), lands in a waiting room.
2. When host starts the round, the question appears with 4 answer choices and a countdown ring.
3. Viewer taps an answer, it locks in immediately (can't change it).
4. When time's up: correct answer highlights, live percentage bars fill in for all 4 options, and the viewer sees whether they're still in or eliminated.
5. If eliminated, they can keep watching in spectator mode for the rest of the round (mirrors how HQ Trivia let you keep watching after you were out).
6. Final screen shows their result: survived and part of the split, or eliminated on round N.

### Overlay Flow (OBS Browser Source)
- Transparent background, no host interaction needed on this screen itself.
- Shows the current question, countdown timer, and live answer distribution, styled to sit on top of gameplay footage.
- Updates automatically whenever the host advances state — this is a read-only mirror of the game state, not a separate control surface.

---

## 4. Explicit Out of Scope for v1 (do not build these yet, even if it seems easy)

- Real money or cash prize payment processing of any kind
- Official Twitch Extension submission/approval — we're using plain web links for now, not the Twitch Extensions platform
- Infrastructure for scaling to tens or hundreds of thousands of concurrent viewers — this is being piloted with a small community, design for maybe 50-500 concurrent players
- User accounts or persistent login — nicknames per session are enough
- Admin analytics dashboards
- Legal/sweepstakes compliance tooling
- A CMS for managing question packs — a JSON file I edit by hand is fine for now

If you find yourself building any of these, stop and check with me first.

---

## 5. Recommended Tech Stack (optimized for free tiers + your strengths)

- **Frontend:** Next.js + React + Tailwind CSS, deployed free on Vercel.
- **Realtime + database:** Supabase (Postgres + realtime subscriptions), free tier. Handles the "everyone sees the same state instantly" requirement without me needing to run my own server.
- **No custom backend server** — keep everything serverless/managed so there's no hosting bill to babysit.
- **Hosting:** Vercel (frontend) + Supabase (data/realtime), both free tier to start.

If you think a different lightweight stack fits better within the budget constraint, propose it and explain the tradeoff before switching — don't just pick silently.

### Rough Data Model
- `sessions` — id, host identifier, question pack used, status (waiting / live / ended), created_at
- `players` — id, session_id, nickname, alive (boolean), joined_at
- `questions` — id, pack_id, text, four options, correct_option_index, order
- `answers` — id, session_id, player_id, question_id, selected_option_index, answered_at

### Realtime Behavior
All three views (host, player, overlay) subscribe to the same session's realtime channel. When the host advances state (start question, reveal, next question), that change should push instantly to every connected client — no polling or manual refresh.

---

## 6. Build Order (do these in sequence, confirm working before moving on)

1. Set up the project, Supabase connection, and the data model above. Confirm I can see tables in Supabase before moving on.
2. Build the host flow: create session, generate links, waiting room, start/advance/reveal logic. Test it solo with a single browser tab acting as host.
3. Build the player flow: join, answer, lock-in, reveal, elimination, spectator mode. Test it with 2-3 browser tabs simulating multiple players against one host tab.
4. Build the overlay view. Test it as an actual OBS browser source, not just in a regular browser tab.
5. Polish pass: styling, mobile responsiveness on the player view specifically (this is what real viewers will use on their phones), basic error handling (what happens if someone's connection drops mid-round).
6. Deploy to Vercel + Supabase free tier. Confirm the whole thing works end to end with people on different devices/networks, not just my laptop.

Do not start step 2 until step 1 is confirmed working. Do not start step 3 until step 2 is confirmed working. Each step should end with something I can actually click through, not just code that compiles.

---

## 7. A Few Things to Keep in Mind

- I have no coding background. Explain what you're doing in plain language as you go, especially any setup steps I need to do myself (creating accounts, running commands).
- Give me exact commands to run and exactly where to click for anything outside your own file editing (Vercel account setup, Supabase project creation, etc.).
- If something breaks, explain what went wrong in plain terms before fixing it, not just the fix.
- The end goal of this specific build is a working pilot tool, not a finished product. Rough edges are fine as long as the core loop works: host starts a round, players answer live, elimination and results work correctly, and it holds up with real people testing it, not just me alone.

---

## 8. First Message to Send

Once you've read all of this, your first response should be:
1. A short summary confirming you understand the scope and constraints.
2. Any clarifying questions before starting.
3. Then begin with step 1 of the build order above.
