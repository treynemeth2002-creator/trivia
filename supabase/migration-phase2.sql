-- Phase 2 migration: game-state columns + reveal logic.
-- Paste this whole file into the Supabase SQL Editor and click "Run".
-- (Only needed if you already ran the original schema.sql; fresh installs
-- get all of this from the updated schema.sql.)

alter table sessions
  add column if not exists current_question_index integer not null default 0,
  add column if not exists question_state text not null default 'idle'
    check (question_state in ('idle', 'asking', 'reveal')),
  add column if not exists question_started_at timestamptz,
  add column if not exists seconds_per_question integer not null default 10;

-- Reveals the current question: eliminates alive players who answered wrong
-- (or didn't answer), then flips the session to the reveal state. Done in one
-- database function so it happens atomically even with many players.
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
