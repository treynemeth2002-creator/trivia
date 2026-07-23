"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Player, Question, Session } from "@/lib/types";

export default function HostControlPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answerCounts, setAnswerCounts] = useState<number[]>([0, 0, 0, 0]);
  const [isHost, setIsHost] = useState<boolean | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const revealFired = useRef(false);

  const currentQuestion =
    session && session.status !== "waiting"
      ? questions.find((q) => q.order === session.current_question_index) ?? null
      : null;

  const refetchSession = useCallback(async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", id)
      .single();
    if (error) setLoadError(error.message);
    else setSession(data as Session);
  }, [id]);

  const refetchPlayers = useCallback(async () => {
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("session_id", id)
      .order("joined_at");
    if (data) setPlayers(data as Player[]);
  }, [id]);

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
    refetchPlayers();
    supabase
      .from("questions")
      .select("*")
      .eq("session_id", id)
      .order("order")
      .then(({ data }) => {
        if (data) setQuestions(data as Question[]);
      });
    setIsHost(localStorage.getItem(`trivia_host_key_${id}`) !== null);

    const channel = supabase
      .channel(`host-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `id=eq.${id}` },
        () => refetchSession()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `session_id=eq.${id}` },
        () => refetchPlayers()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "answers", filter: `session_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { question_id: string };
          refetchAnswerCounts(row.question_id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetchSession, refetchPlayers, refetchAnswerCounts]);

  // Refresh answer counts whenever the active question changes.
  useEffect(() => {
    if (currentQuestion) {
      revealFired.current = false;
      refetchAnswerCounts(currentQuestion.id);
    }
  }, [currentQuestion?.id, refetchAnswerCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown driver: ticks the timer and fires the reveal when it hits zero.
  useEffect(() => {
    if (!session || session.question_state !== "asking" || !session.question_started_at) {
      return;
    }
    const endsAt =
      new Date(session.question_started_at).getTime() +
      session.seconds_per_question * 1000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0 && !revealFired.current) {
        revealFired.current = true;
        supabase.rpc("reveal_current_question", { p_session_id: id }).then(() => {
          refetchSession();
          refetchPlayers();
        });
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [session?.question_state, session?.question_started_at, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance: move to the next question a few seconds after reveal.
  useEffect(() => {
    if (!autoAdvance || session?.question_state !== "reveal") return;
    const t = setTimeout(() => nextQuestion(), 6000);
    return () => clearTimeout(t);
  }, [autoAdvance, session?.question_state]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startGame() {
    await supabase
      .from("sessions")
      .update({
        status: "live",
        current_question_index: 0,
        question_state: "asking",
        question_started_at: new Date().toISOString(),
      })
      .eq("id", id);
  }

  async function nextQuestion() {
    if (!session) return;
    const isLast = session.current_question_index >= questions.length - 1;
    if (isLast) {
      await supabase
        .from("sessions")
        .update({ status: "ended", question_state: "idle" })
        .eq("id", id);
    } else {
      await supabase
        .from("sessions")
        .update({
          current_question_index: session.current_question_index + 1,
          question_state: "asking",
          question_started_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loadError) {
    return (
      <Shell>
        <p className="text-rose-300">Couldn&apos;t load this session: {loadError}</p>
      </Shell>
    );
  }
  if (!session || isHost === null) {
    return (
      <Shell>
        <p className="text-slate-400">Loading…</p>
      </Shell>
    );
  }
  if (!isHost) {
    return (
      <Shell>
        <p className="text-amber-300">
          This browser isn&apos;t the host of this session. Open the session from
          the device that created it.
        </p>
      </Shell>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const playerLink = `${origin}/play/${id}`;
  const overlayLink = `${origin}/overlay/${id}`;
  const aliveCount = players.filter((p) => p.alive).length;
  const totalAnswers = answerCounts.reduce((a, b) => a + b, 0);

  return (
    <Shell>
      <div className="w-full max-w-2xl space-y-6">
        <header className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">{session.name}</h1>
          <span className="text-sm uppercase tracking-wide text-slate-400">
            {session.status === "waiting"
              ? "Waiting room"
              : session.status === "live"
              ? `Question ${session.current_question_index + 1} of ${questions.length}`
              : "Finished"}
          </span>
        </header>

        {/* ---------- WAITING ROOM ---------- */}
        {session.status === "waiting" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
              <h2 className="font-semibold">Share these links</h2>
              <LinkRow
                label="Player Link (viewers open this on their phones)"
                value={playerLink}
                copied={copied === "player"}
                onCopy={() => copy(playerLink, "player")}
              />
              <LinkRow
                label="Overlay Link (add as OBS browser source)"
                value={overlayLink}
                copied={copied === "overlay"}
                onCopy={() => copy(overlayLink, "overlay")}
              />
              <p className="text-xs text-slate-500">
                The overlay page arrives in the next build phase — its link is
                fixed now so you can set up OBS early.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-center">
              <p className="text-5xl font-bold">{players.length}</p>
              <p className="mt-1 text-slate-400">
                player{players.length === 1 ? "" : "s"} joined
                {session.expected_players
                  ? ` (expecting ~${session.expected_players})`
                  : ""}
              </p>
            </div>

            <button
              onClick={startGame}
              disabled={questions.length === 0}
              className="w-full rounded-xl bg-emerald-600 px-4 py-4 text-lg font-bold hover:bg-emerald-500 disabled:opacity-50"
            >
              Start the game
            </button>
          </div>
        )}

        {/* ---------- LIVE: ASKING ---------- */}
        {session.status === "live" &&
          session.question_state === "asking" &&
          currentQuestion && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">{currentQuestion.text}</h2>
                  <span className="ml-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-indigo-500 text-xl font-bold">
                    {secondsLeft}
                  </span>
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-2">
                  {currentQuestion.options.map((opt, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
                    >
                      {opt}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-center text-slate-400">
                {totalAnswers} of {aliveCount} alive players answered
              </p>
            </div>
          )}

        {/* ---------- LIVE: REVEAL ---------- */}
        {session.status === "live" &&
          session.question_state === "reveal" &&
          currentQuestion && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <h2 className="text-xl font-semibold">{currentQuestion.text}</h2>
                <div className="mt-4 space-y-2">
                  {currentQuestion.options.map((opt, i) => {
                    const count = answerCounts[i];
                    const pct = totalAnswers ? Math.round((count / totalAnswers) * 100) : 0;
                    const correct = i === currentQuestion.correct_option_index;
                    return (
                      <div
                        key={i}
                        className={`relative overflow-hidden rounded-lg border px-3 py-2 ${
                          correct
                            ? "border-emerald-500 bg-emerald-500/10"
                            : "border-slate-700 bg-slate-800"
                        }`}
                      >
                        <div
                          className={`absolute inset-y-0 left-0 ${
                            correct ? "bg-emerald-500/25" : "bg-slate-600/30"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex justify-between text-sm">
                          <span>
                            {correct ? "✅ " : ""}
                            {opt}
                          </span>
                          <span>
                            {count} · {pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">
                <span className="text-3xl font-bold text-emerald-400">{aliveCount}</span>{" "}
                <span className="text-slate-400">
                  of {players.length} players still in
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={nextQuestion}
                  className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 font-bold hover:bg-indigo-500"
                >
                  {session.current_question_index >= questions.length - 1
                    ? "Finish game"
                    : "Next question"}
                </button>
                <label className="flex items-center gap-2 text-sm text-slate-400">
                  <input
                    type="checkbox"
                    checked={autoAdvance}
                    onChange={(e) => setAutoAdvance(e.target.checked)}
                  />
                  Auto-advance
                </label>
              </div>
            </div>
          )}

        {/* ---------- ENDED ---------- */}
        {session.status === "ended" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-center">
              <h2 className="text-xl font-bold text-emerald-300">
                Game over — {aliveCount} survivor{aliveCount === 1 ? "" : "s"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Screenshot this list or copy it to handle your payout.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              {aliveCount === 0 ? (
                <p className="text-center text-slate-400">
                  Nobody survived every question. Brutal.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {players
                    .filter((p) => p.alive)
                    .map((p) => (
                      <li
                        key={p.id}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-center text-sm"
                      >
                        {p.nickname}
                      </li>
                    ))}
                </ul>
              )}
            </div>
            {aliveCount > 0 && (
              <button
                onClick={() =>
                  copy(
                    players
                      .filter((p) => p.alive)
                      .map((p) => p.nickname)
                      .join("\n"),
                    "survivors"
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 font-semibold hover:bg-slate-800"
              >
                {copied === "survivors" ? "Copied!" : "Copy survivor list"}
              </button>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-6 pt-10">
      {children}
    </main>
  );
}

function LinkRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <div className="mt-1 flex gap-2">
        <input
          readOnly
          value={value}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300"
        />
        <button
          onClick={onCopy}
          className="shrink-0 rounded-lg bg-indigo-600 px-4 text-sm font-semibold hover:bg-indigo-500"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
