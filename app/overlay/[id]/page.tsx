"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { revealQuip } from "@/lib/quips";
import { useDebounced } from "@/lib/useDebounced";
import type { Player, Question, Session } from "@/lib/types";

type FloatingEmoji = { key: number; emoji: string; left: number };

/**
 * OBS browser-source overlay: a transparent, read-only mirror of the game.
 * Add the page URL as a Browser Source in OBS/Streamlabs (transparent
 * backgrounds are the default there). No interaction happens here.
 */
export default function OverlayPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answerCounts, setAnswerCounts] = useState<number[]>([0, 0, 0, 0]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [floats, setFloats] = useState<FloatingEmoji[]>([]);
  const floatKey = useRef(0);
  const aliveAtQuestionStart = useRef<number | null>(null);

  const currentQuestion =
    session && session.status === "live"
      ? questions.find((q) => q.order === session.current_question_index) ?? null
      : null;

  const refetchSession = useCallback(async () => {
    const { data } = await supabase.from("sessions").select("*").eq("id", id).single();
    if (data) setSession(data as Session);
  }, [id]);

  const refetchPlayers = useCallback(async () => {
    const { data } = await supabase.from("players").select("*").eq("session_id", id);
    if (data) setPlayers(data as Player[]);
  }, [id]);

  const refetchQuestions = useCallback(async () => {
    const { data } = await supabase.from("questions").select("*").eq("session_id", id);
    if (data) setQuestions(data as Question[]);
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

  // Bursts of player/answer events (everyone answering at once) collapse
  // into a single refetch.
  const debouncedPlayers = useDebounced(() => refetchPlayers(), 400);
  const lastAnswerQuestionId = useRef<string | null>(null);
  const debouncedAnswers = useDebounced(() => {
    if (lastAnswerQuestionId.current) {
      refetchAnswerCounts(lastAnswerQuestionId.current);
    }
  }, 400);

  useEffect(() => {
    refetchSession();
    refetchPlayers();
    refetchQuestions();

    const channel = supabase
      .channel(`overlay-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions", filter: `id=eq.${id}` },
        () => refetchSession()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `session_id=eq.${id}` },
        () => debouncedPlayers()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "answers", filter: `session_id=eq.${id}` },
        (payload) => {
          const row = payload.new as { question_id: string };
          lastAnswerQuestionId.current = row.question_id;
          debouncedAnswers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetchSession, refetchPlayers, refetchQuestions, debouncedPlayers, debouncedAnswers]);

  // Live emoji reactions from players float up over the stream.
  useEffect(() => {
    const ch = supabase
      .channel(`reactions-${id}`)
      .on("broadcast", { event: "react" }, (msg) => {
        const emoji = (msg.payload as { emoji?: string })?.emoji;
        if (!emoji || emoji.length > 4) return;
        floatKey.current += 1;
        const item: FloatingEmoji = {
          key: floatKey.current,
          emoji,
          left: 10 + Math.random() * 80,
        };
        setFloats((prev) => [...prev.slice(-24), item]);
        setTimeout(
          () => setFloats((prev) => prev.filter((f) => f.key !== item.key)),
          2300
        );
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  // Connection-drop safety net: OBS keeps the page alive for hours, so poll
  // and refetch on wake in case the realtime stream silently died.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "hidden") return;
      refetchSession();
      refetchPlayers();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    const poll = setInterval(onWake, 15000);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      clearInterval(poll);
    };
  }, [refetchSession, refetchPlayers]);

  // Keep the question list fresh (it's inserted right before a session
  // goes live, so refetch when the session flips state).
  useEffect(() => {
    if (session?.status === "live" && questions.length === 0) refetchQuestions();
  }, [session?.status, questions.length, refetchQuestions]);

  useEffect(() => {
    if (currentQuestion) refetchAnswerCounts(currentQuestion.id);
  }, [currentQuestion?.id, refetchAnswerCounts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Snapshot the alive count when a question starts so the reveal quip can
  // say how many fell this round.
  useEffect(() => {
    if (session?.question_state === "asking") {
      aliveAtQuestionStart.current = players.filter((p) => p.alive).length;
    }
  }, [session?.question_state, session?.current_question_index]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const transparent = (
    <style>{`html, body { background: transparent !important; }`}</style>
  );

  if (!session) return transparent;

  const aliveCount = players.filter((p) => p.alive).length;
  const totalAnswers = answerCounts.reduce((a, b) => a + b, 0);
  const asking = session.question_state === "asking";
  const reveal = session.question_state === "reveal";
  const survivors = players.filter((p) => p.alive);

  const eliminatedThisRound = Math.max(
    0,
    (aliveAtQuestionStart.current ?? aliveCount) - aliveCount
  );

  return (
    <>
      {transparent}
      {floats.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 top-0 z-40 overflow-hidden">
          {floats.map((f) => (
            <span
              key={f.key}
              className="float-emoji"
              style={{ left: `${f.left}%`, fontSize: "2.5rem" }}
            >
              {f.emoji}
            </span>
          ))}
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 flex justify-center p-6 text-slate-100">
        <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950/85 p-5 shadow-2xl backdrop-blur">
          {/* -------- waiting -------- */}
          {session.status === "waiting" && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-2xl font-black tracking-tight">{session.name}</p>
                <p className="mt-1 text-lg text-slate-300">
                  Join now from the link in chat — game starts soon!
                </p>
              </div>
              <div className="text-center">
                <p className="text-5xl font-black text-indigo-400">{players.length}</p>
                <p className="text-sm uppercase tracking-wide text-slate-400">
                  player{players.length === 1 ? "" : "s"} in
                </p>
              </div>
            </div>
          )}

          {/* -------- live question -------- */}
          {session.status === "live" && currentQuestion && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-indigo-400">
                    Question {session.current_question_index + 1}
                  </p>
                  <p
                    className="mt-1 text-2xl font-black leading-snug pop"
                    key={currentQuestion.id}
                  >
                    {currentQuestion.text}
                  </p>
                </div>
                {asking && (
                  <div
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 text-2xl font-black ${
                      secondsLeft <= 3
                        ? "border-rose-500 text-rose-400"
                        : "border-indigo-500 text-slate-100"
                    }`}
                  >
                    {secondsLeft}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {currentQuestion.options.map((opt, i) => {
                  const pct = totalAnswers
                    ? Math.round((answerCounts[i] / totalAnswers) * 100)
                    : 0;
                  const correct = reveal && i === currentQuestion.correct_option_index;
                  return (
                    <div
                      key={i}
                      className={`relative overflow-hidden rounded-xl border px-4 py-3 text-lg font-semibold ${
                        correct
                          ? "border-emerald-400 bg-emerald-500/15"
                          : "border-white/15 bg-white/5"
                      }`}
                    >
                      {reveal && (
                        <div
                          className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-out ${
                            correct ? "bg-emerald-500/30" : "bg-slate-500/25"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                      <span className="relative flex items-center justify-between gap-2">
                        <span>
                          {correct ? "✅ " : ""}
                          {opt}
                        </span>
                        {reveal && (
                          <span className="text-base text-slate-300">{pct}%</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-slate-300">
                {asking ? (
                  <p>
                    <span className="font-bold text-slate-100">{totalAnswers}</span>{" "}
                    locked in
                  </p>
                ) : (
                  <p>
                    <span className="font-bold text-emerald-400">{aliveCount}</span>{" "}
                    still standing —{" "}
                    <span className="italic text-slate-400">
                      {revealQuip(
                        eliminatedThisRound,
                        aliveCount,
                        session.current_question_index
                      )}
                    </span>
                  </p>
                )}
                <p className="text-sm uppercase tracking-wide text-slate-500">
                  {session.name}
                </p>
              </div>
            </div>
          )}

          {/* -------- ended -------- */}
          {session.status === "ended" && (
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-wide text-indigo-400">
                {session.name}
              </p>
              <p className="mt-1 text-3xl font-black">
                🏆 {survivors.length} survivor{survivors.length === 1 ? "" : "s"}
              </p>
              {survivors.length > 0 && (
                <p className="mx-auto mt-2 max-w-xl text-lg text-slate-300">
                  {survivors
                    .slice(0, 12)
                    .map((p) => p.nickname)
                    .join(" · ")}
                  {survivors.length > 12 ? ` · +${survivors.length - 12} more` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
