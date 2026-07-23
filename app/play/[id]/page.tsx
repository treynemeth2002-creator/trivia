"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Player, Question, Session } from "@/lib/types";

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerLoaded, setPlayerLoaded] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answerCounts, setAnswerCounts] = useState<number[]>([0, 0, 0, 0]);
  const [selected, setSelected] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [eliminatedOn, setEliminatedOn] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storageKey = `trivia_player_${id}`;
  const elimKey = `trivia_eliminated_on_${id}`;

  const refetchSession = useCallback(async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (error) setError("This game link doesn't seem to exist.");
    else setSession(data as Session);
  }, [id]);

  const refetchPlayer = useCallback(async () => {
    const playerId = localStorage.getItem(storageKey);
    if (!playerId) {
      setPlayerLoaded(true);
      return;
    }
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();
    if (data) setPlayer(data as Player);
    else localStorage.removeItem(storageKey);
    setPlayerLoaded(true);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetchAnswerCounts = useCallback(
    async (questionId: string) => {
      const { data } = await supabase
        .from("answers")
        .select("selected_option_index")
        .eq("session_id", id)
        .eq("question_id", questionId);
      if (data) {
        const counts = [0, 0, 0, 0];
        for (const a of data) counts[a.selected_option_index]++;
        setAnswerCounts(counts);
      }
    },
    [id]
  );

  // Initial load + realtime subscription.
  useEffect(() => {
    refetchSession();
    refetchPlayer();
    setEliminatedOn(
      localStorage.getItem(elimKey) !== null
        ? Number(localStorage.getItem(elimKey))
        : null
    );

    const channel = supabase
      .channel(`play-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `id=eq.${id}` },
        () => refetchSession()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `session_id=eq.${id}` },
        () => refetchPlayer()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetchSession, refetchPlayer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the active question (and my existing answer) whenever it changes.
  useEffect(() => {
    if (!session || session.status !== "live") {
      setQuestion(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("questions")
        .select("*")
        .eq("session_id", id)
        .eq("order", session.current_question_index)
        .single();
      if (cancelled || !data) return;
      const q = data as Question;
      setQuestion(q);
      setSelected(null);
      const playerId = localStorage.getItem(storageKey);
      if (playerId) {
        const { data: mine } = await supabase
          .from("answers")
          .select("selected_option_index")
          .eq("question_id", q.id)
          .eq("player_id", playerId)
          .maybeSingle();
        if (!cancelled && mine) setSelected(mine.selected_option_index);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, session?.status, session?.current_question_index]); // eslint-disable-line react-hooks/exhaustive-deps

  // On reveal: fetch the distribution; remember when I got knocked out.
  useEffect(() => {
    if (session?.question_state === "reveal" && question) {
      refetchAnswerCounts(question.id);
    }
  }, [session?.question_state, question?.id, refetchAnswerCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      session?.question_state === "reveal" &&
      player &&
      !player.alive &&
      eliminatedOn === null
    ) {
      const n = session.current_question_index + 1;
      setEliminatedOn(n);
      localStorage.setItem(elimKey, String(n));
    }
  }, [session?.question_state, player?.alive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown ticker (display only — the host's browser drives the reveal).
  useEffect(() => {
    if (!session || session.question_state !== "asking" || !session.question_started_at) {
      return;
    }
    const endsAt =
      new Date(session.question_started_at).getTime() +
      session.seconds_per_question * 1000;
    const tick = () =>
      setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [session?.question_state, session?.question_started_at]); // eslint-disable-line react-hooks/exhaustive-deps

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const nick = nickname.trim();
    if (!nick) return;
    setJoining(true);
    const { data, error } = await supabase
      .from("players")
      .insert({ session_id: id, nickname: nick.slice(0, 24) })
      .select()
      .single();
    if (error || !data) {
      setError(error?.message ?? "Couldn't join — try again.");
      setJoining(false);
      return;
    }
    localStorage.setItem(storageKey, data.id);
    setPlayer(data as Player);
    setJoining(false);
  }

  async function answer(optionIndex: number) {
    if (!player || !question || selected !== null || !player.alive) return;
    if (secondsLeft <= 0) return;
    setSelected(optionIndex); // lock in immediately
    const { error } = await supabase.from("answers").insert({
      session_id: id,
      player_id: player.id,
      question_id: question.id,
      selected_option_index: optionIndex,
    });
    if (error && !error.message.includes("duplicate")) {
      setSelected(null); // let them retry if the insert genuinely failed
    }
  }

  /* ---------------- render ---------------- */

  if (error) {
    return (
      <Shell>
        <p className="text-center text-rose-300">{error}</p>
      </Shell>
    );
  }
  if (!session || !playerLoaded) {
    return (
      <Shell>
        <p className="text-center text-slate-400">Loading…</p>
      </Shell>
    );
  }

  // Not joined yet.
  if (!player) {
    if (session.status === "ended") {
      return (
        <Shell>
          <h1 className="text-2xl font-bold text-center">{session.name}</h1>
          <p className="mt-3 text-center text-slate-400">
            This game has already ended. Catch the next one!
          </p>
        </Shell>
      );
    }
    return (
      <Shell>
        <form onSubmit={join} className="w-full space-y-4">
          <div className="text-center">
            <h1 className="text-2xl font-bold">{session.name}</h1>
            <p className="mt-1 text-slate-400">Pick a nickname to play</p>
          </div>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your nickname"
            maxLength={24}
            autoFocus
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-center text-lg outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={joining || !nickname.trim()}
            className="w-full rounded-xl bg-indigo-600 px-4 py-4 text-lg font-bold hover:bg-indigo-500 disabled:opacity-50"
          >
            {joining ? "Joining…" : "Join the game"}
          </button>
          {session.status === "live" && (
            <p className="text-center text-xs text-amber-300">
              The game already started — you can join, but you&apos;ll need to
              answer the current question to stay in.
            </p>
          )}
        </form>
      </Shell>
    );
  }

  const spectating = !player.alive;

  // Waiting room.
  if (session.status === "waiting") {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">{session.name}</h1>
          <p className="text-4xl">🎉</p>
          <p className="text-lg">
            You&apos;re in, <span className="font-bold">{player.nickname}</span>!
          </p>
          <p className="text-slate-400">
            Hang tight — the host will start the game soon.
          </p>
        </div>
      </Shell>
    );
  }

  // Game over.
  if (session.status === "ended") {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">{session.name}</h1>
          {player.alive ? (
            <>
              <p className="text-5xl">🏆</p>
              <p className="text-xl font-bold text-emerald-400">
                You survived, {player.nickname}!
              </p>
              <p className="text-slate-400">
                You&apos;re part of the winners&apos; split — the host will sort
                out the prize.
              </p>
            </>
          ) : (
            <>
              <p className="text-5xl">💀</p>
              <p className="text-xl font-bold text-rose-400">
                Eliminated{eliminatedOn ? ` on question ${eliminatedOn}` : ""}
              </p>
              <p className="text-slate-400">
                Better luck next round, {player.nickname}.
              </p>
            </>
          )}
        </div>
      </Shell>
    );
  }

  // Live game.
  if (!question) {
    return (
      <Shell>
        <p className="text-center text-slate-400">Loading question…</p>
      </Shell>
    );
  }

  const totalAnswers = answerCounts.reduce((a, b) => a + b, 0);
  const asking = session.question_state === "asking";
  const reveal = session.question_state === "reveal";
  const frac =
    session.seconds_per_question > 0
      ? secondsLeft / session.seconds_per_question
      : 0;

  return (
    <Shell wide>
      <div className="w-full space-y-4">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            Question {session.current_question_index + 1}
            {spectating && (
              <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-xs text-amber-300">
                👻 Spectating
              </span>
            )}
          </span>
          {asking && <CountdownRing seconds={secondsLeft} frac={frac} />}
        </div>

        <h1 className="text-xl font-bold leading-snug">{question.text}</h1>

        <div className="space-y-3">
          {question.options.map((opt, i) => {
            const isMine = selected === i;
            const isCorrect = i === question.correct_option_index;
            const pct = totalAnswers ? Math.round((answerCounts[i] / totalAnswers) * 100) : 0;

            let cls = "border-slate-700 bg-slate-800";
            if (asking && isMine) cls = "border-indigo-400 bg-indigo-500/20";
            if (reveal && isCorrect) cls = "border-emerald-500 bg-emerald-500/10";
            if (reveal && isMine && !isCorrect) cls = "border-rose-500 bg-rose-500/10";

            return (
              <button
                key={i}
                onClick={() => answer(i)}
                disabled={!asking || spectating || selected !== null || secondsLeft <= 0}
                className={`relative w-full overflow-hidden rounded-xl border px-4 py-4 text-left text-lg transition ${cls} ${
                  asking && !spectating && selected === null && secondsLeft > 0
                    ? "active:scale-[0.98]"
                    : ""
                }`}
              >
                {reveal && (
                  <div
                    className={`absolute inset-y-0 left-0 ${
                      isCorrect ? "bg-emerald-500/25" : "bg-slate-600/30"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span className="relative flex items-center justify-between">
                  <span>
                    {reveal && isCorrect ? "✅ " : ""}
                    {isMine ? "👉 " : ""}
                    {opt}
                  </span>
                  {reveal && <span className="text-sm text-slate-300">{pct}%</span>}
                </span>
              </button>
            );
          })}
        </div>

        {asking && !spectating && (
          <p className="text-center text-sm text-slate-400">
            {selected !== null
              ? "Locked in! Waiting for the reveal…"
              : secondsLeft > 0
              ? "Tap an answer — it locks in instantly."
              : "Time's up!"}
          </p>
        )}

        {reveal && !spectating && (
          <p
            className={`rounded-xl border p-3 text-center font-bold ${
              player.alive
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-300"
            }`}
          >
            {player.alive
              ? "✅ You're still in!"
              : "💀 Eliminated — you can keep watching"}
          </p>
        )}
      </div>
    </Shell>
  );
}

function CountdownRing({ seconds, frac }: { seconds: number; frac: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-12 w-12 items-center justify-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#334155" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={frac > 0.3 ? "#6366f1" : "#f43f5e"}
          strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-lg font-bold text-slate-100">{seconds}</span>
    </span>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-5">
      <div className={`w-full ${wide ? "max-w-lg" : "max-w-sm"}`}>{children}</div>
    </main>
  );
}
