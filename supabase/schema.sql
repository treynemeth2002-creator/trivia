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
  current_question_index integer not null default 0,
  question_state text not null default 'idle' check (question_state in ('idle', 'asking', 'reveal')),
  question_started_at timestamptz,
  seconds_per_question integer not null default 10,
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

-- Reveals the current question: eliminates alive players who answered wrong
-- (or didn't answer), then flips the session to the reveal state.
create or replace function reveal_current_question(p_session_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_session sessions;
  v_question questions;
begin
  select * into v_session from sessions where id = p_session_id;
  if v_session.id is null or v_session.question_state <> 'asking' then
    return;
  end if;

  select * into v_question from questions
    where session_id = p_session_id
    and "order" = v_session.current_question_index;
  if v_question.id is null then
    return;
  end if;

  update players p set alive = false
    where p.session_id = p_session_id
    and p.alive
    and not exists (
      select 1 from answers a
      where a.player_id = p.id
        and a.question_id = v_question.id
        and a.selected_option_index = v_question.correct_option_index
    );

  update sessions set question_state = 'reveal' where id = p_session_id;
end;
$$;

-- Realtime: broadcast row changes on these tables to subscribed clients.
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table answers;
