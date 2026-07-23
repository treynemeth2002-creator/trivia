import { supabase } from "@/lib/supabase";
import type { AnswerRow, Player, Question, Session } from "@/lib/types";

// Points by round type:
//   trivia   -> 100–500 per correct answer, scaled by speed relative to the
//               first answer on that question (flat 500 with speed scoring off)
//   majority -> 200 for picking the crowd's winning option
//   closest  -> 500/400/300 for the three closest guesses, 100 for any guess
export type PlayerScore = {
  player: Player;
  points: number;
  correct: number;
};

export function computeScores(
  session: Session,
  questions: Question[],
  answers: AnswerRow[],
  players: Player[]
): PlayerScore[] {
  const byQuestion = new Map<string, AnswerRow[]>();
  for (const a of answers) {
    const list = byQuestion.get(a.question_id) ?? [];
    list.push(a);
    byQuestion.set(a.question_id, list);
  }

  const totals = new Map<string, { points: number; correct: number }>();
  const add = (playerId: string, points: number, correct: boolean) => {
    const entry = totals.get(playerId) ?? { points: 0, correct: 0 };
    entry.points += points;
    if (correct) entry.correct += 1;
    totals.set(playerId, entry);
  };

  for (const q of questions) {
    const qAnswers = byQuestion.get(q.id) ?? [];
    if (q.type === "majority") {
      const counts = new Map<number, number>();
      for (const a of qAnswers) {
        if (a.selected_option_index === null) continue;
        counts.set(a.selected_option_index, (counts.get(a.selected_option_index) ?? 0) + 1);
      }
      const max = Math.max(0, ...counts.values());
      if (max === 0) continue;
      for (const a of qAnswers) {
        if (a.selected_option_index !== null && counts.get(a.selected_option_index) === max) {
          add(a.player_id, 200, true);
        }
      }
    } else if (q.type === "closest") {
      const guesses = qAnswers
        .filter((a) => a.guess_value !== null)
        .sort(
          (a, b) =>
            Math.abs((a.guess_value ?? 0) - (q.numeric_answer ?? 0)) -
            Math.abs((b.guess_value ?? 0) - (q.numeric_answer ?? 0))
        );
      guesses.forEach((a, i) => {
        add(a.player_id, i === 0 ? 500 : i === 1 ? 400 : i === 2 ? 300 : 100, i < 3);
      });
    } else {
      const firstAt = Math.min(
        ...qAnswers.map((a) => new Date(a.answered_at).getTime())
      );
      for (const a of qAnswers) {
        if (a.selected_option_index !== q.correct_option_index) continue;
        add(a.player_id, answerPoints(session, a, firstAt), true);
      }
    }
  }

  return players
    .map((p) => ({
      player: p,
      points: totals.get(p.id)?.points ?? 0,
      correct: totals.get(p.id)?.correct ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.player.alive) - Number(a.player.alive) ||
        b.points - a.points ||
        b.correct - a.correct
    );
}

export function answerPoints(
  session: Session,
  answer: AnswerRow,
  firstAnswerAtMs: number | undefined
): number {
  if (!session.speed_scoring) return 500;
  const elapsed =
    firstAnswerAtMs === undefined || !Number.isFinite(firstAnswerAtMs)
      ? 0
      : (new Date(answer.answered_at).getTime() - firstAnswerAtMs) / 1000;
  const frac = Math.max(0, 1 - elapsed / session.seconds_per_question);
  return 100 + Math.round(400 * frac);
}

/** Fetches everything needed for the end-of-game leaderboard. */
export async function loadFinalScores(session: Session): Promise<PlayerScore[]> {
  const [{ data: questions }, { data: answers }, { data: players }] =
    await Promise.all([
      supabase.from("questions").select("*").eq("session_id", session.id),
      supabase
        .from("answers")
        .select("player_id, question_id, selected_option_index, guess_value, answered_at")
        .eq("session_id", session.id),
      supabase.from("players").select("*").eq("session_id", session.id),
    ]);
  return computeScores(
    session,
    (questions as Question[]) ?? [],
    (answers as AnswerRow[]) ?? [],
    (players as Player[]) ?? []
  );
}
