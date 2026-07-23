import { supabase } from "@/lib/supabase";
import type { AnswerRow, Player, Question, Session } from "@/lib/types";

// Speed scoring: a correct answer is worth 100–500 points depending on how
// fast it came in relative to the first answer on that question (we don't
// store per-question start times, so "first tap" is the stopwatch zero).
// With speed scoring off, every correct answer is a flat 500 so rankings
// reduce to "most correct".

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
  const correctIndex = new Map(questions.map((q) => [q.id, q.correct_option_index]));
  const firstAnswerAt = new Map<string, number>();
  for (const a of answers) {
    const t = new Date(a.answered_at).getTime();
    const prev = firstAnswerAt.get(a.question_id);
    if (prev === undefined || t < prev) firstAnswerAt.set(a.question_id, t);
  }

  const totals = new Map<string, { points: number; correct: number }>();
  for (const a of answers) {
    if (correctIndex.get(a.question_id) !== a.selected_option_index) continue;
    const entry = totals.get(a.player_id) ?? { points: 0, correct: 0 };
    entry.correct += 1;
    entry.points += answerPoints(session, a, firstAnswerAt.get(a.question_id));
    totals.set(a.player_id, entry);
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
    firstAnswerAtMs === undefined
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
        .select("player_id, question_id, selected_option_index, answered_at")
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
