-- Round-types migration: majority and closest-guess rounds alongside trivia.
-- Paste this whole file into the Supabase SQL Editor and click "Run".

alter table questions
  add column if not exists type text not null default 'trivia',
  add column if not exists numeric_answer double precision;
alter table questions alter column correct_option_index drop not null;

alter table answers
  add column if not exists guess_value double precision;
alter table answers alter column selected_option_index drop not null;

-- Reveal now handles three round types:
--   trivia   -> wrong/missing answers are eliminated
--   majority -> nobody is eliminated (crowd-split fun round)
--   closest  -> the closest half of alive players survives; no guess ranks last
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

  if v_question.type = 'closest' then
    update players p set alive = false
    where p.id in (
      select id from (
        select pl.id,
               row_number() over (
                 order by abs(coalesce(a.guess_value, 1e300) - coalesce(v_question.numeric_answer, 0))
               ) as rn,
               count(*) over () as total
        from players pl
        left join answers a
          on a.player_id = pl.id and a.question_id = v_question.id
        where pl.session_id = p_session_id and pl.alive
      ) ranked
      where ranked.rn > greatest(1, (ranked.total + 1) / 2)
    );
  elsif v_question.type = 'majority' then
    null; -- vibes only, no eliminations
  else
    update players p set alive = false
      where p.session_id = p_session_id
      and p.alive
      and not exists (
        select 1 from answers a
        where a.player_id = p.id
          and a.question_id = v_question.id
          and a.selected_option_index = v_question.correct_option_index
      );
  end if;

  update sessions set question_state = 'reveal' where id = p_session_id;
end;
$$;
