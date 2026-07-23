-- Live Trivia MVP — database schema (Phase 1)
-- Paste this whole file into the Supabase SQL Editor and click "Run".
-- Safe to re-run: it drops and recreates the trivia tables.

drop table if exists answers;
drop table if exists players;
drop table if exists questions;
drop table if exists sessions;

-- One row per live trivia session a host creates.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_key text not null,              -- random secret held by the host's browser
  pack_id text not null,               -- which question pack JSON was loaded
  expected_players integer not null default 50,
  status text not null default 'waiting' check (status in ('waiting', 'live', 'ended')),
  created_at timestamptz not null default now()
);

-- Questions copied out of the pack JSON when a session is created.
create table questions (
  id uuid primary key default gen_random_uuid(),
  pack_id text not null,
  session_id uuid not null references sessions(id) on delete cascade,
  text text not null,
  options jsonb not null,              -- array of exactly 4 answer strings
  correct_option_index integer not null check (correct_option_index between 0 and 3),
  "order" integer not null
);

-- One row per viewer who joins a session (nickname only, no accounts).
create table players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  nickname text not null,
  alive boolean not null default true,
  joined_at timestamptz not null default now()
);

-- One row per answer a player locks in.
create table answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  selected_option_index integer not null check (selected_option_index between 0 and 3),
  answered_at timestamptz not null default now(),
  unique (player_id, question_id)     -- a player can only answer each question once
);

create index players_session_idx on players(session_id);
create index questions_session_idx on questions(session_id, "order");
create index answers_session_question_idx on answers(session_id, question_id);

-- Row Level Security: open read/write for the anonymous key.
-- Fine for a small pilot with no real money involved; tighten later if needed.
alter table sessions enable row level security;
alter table questions enable row level security;
alter table players enable row level security;
alter table answers enable row level security;

create policy "anon full access sessions" on sessions for all using (true) with check (true);
create policy "anon full access questions" on questions for all using (true) with check (true);
create policy "anon full access players" on players for all using (true) with check (true);
create policy "anon full access answers" on answers for all using (true) with check (true);

-- Realtime: broadcast row changes on these tables to subscribed clients.
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table answers;
