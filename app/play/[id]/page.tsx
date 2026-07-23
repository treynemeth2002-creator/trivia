"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setMuted, sounds, unlockAudio } from "@/lib/sounds";
import { answerPoints, loadFinalScores, type PlayerScore } from "@/lib/scoring";
import { useDebounced } from "@/lib/useDebounced";
import type { AnswerRow, Player, Question, Session } from "@/lib/types";

const REACTION_EMOJIS = ["🔥", "😂", "😱", "💀"];

type FloatingEmoji = { key: number; emoji: string; left: number };

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerLoaded, setPlayerLoaded] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answerCounts, setAnswerCounts] = useState<number[]>([0, 0, 0, 0]);
  const [aliveCount, setAliveCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [nickname, setNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [eliminatedOn, setEliminatedOn] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [floats, setFloats] = useState<FloatingEmoji[]>([]);
  const [currentAnswers, setCurrentAnswers] = useState<AnswerRow[]>([]);
  const [finalScores, setFinalScores] = useState<PlayerScore[] | null>(null);
  const [revived, setRevived] = useState(false);
  const [guessInput, setGuessInput] = useState("");
  const [lockedGuess, setLockedGuess] = useState<number | null>(null);
  const backupRevealFired = useRef(false);
  const revealSoundFired = useRef(false);
  const lastTickSecond = useRef<number | null>(null);
  const lastReactionAt = useRef(0);
  const floatKey = useRef(0);
  const reactChannel = useRef<RealtimeChannel | null>(null);

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

  const refetchAliveCount = useCallback(async () => {
    const { count } = await supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("session_id", id)
      .eq("alive", true);
    if (count !== null) setAliveCount(count);
  }, [id]);

  const refetchAnswerCounts = useCallback(
    async (questionId: string) => {
      const { data } = await supabase
        .from("answers")
        .select("player_id, question_id, selected_option_index, guess_value, answered_at")
        .eq("session_id", id)
        .eq("question_id", questionId);
      if (data) {
        const rows = data as AnswerRow[];
        const counts = [0, 0, 0, 0];
        for (const a of rows) {
          if (a.selected_option_index !== null) counts[a.selected_option_index]++;
        }
        setAnswerCounts(counts);
        setCurrentAnswers(rows);
      }
    },
    [id]
  );

  // When hundreds of players change at once (mass elimination), refetch once.
  const debouncedPlayerSync = useDebounced(() => {
    refetchPlayer();
    refetchAliveCount();
  }, 400);

  // Initial load + realtime subscription.
  useEffect(() => {
    refetchSession();
    refetchPlayer();
    refetchAliveCount();
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
        () => debouncedPlayerSync()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, refetchSession, refetchPlayer, refetchAliveCount, debouncedPlayerSync]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live emoji reactions: broadcast-only (nothing stored in the database).
  useEffect(() => {
    const ch = supabase
      .channel(`reactions-${id}`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "react" }, (msg) => {
        const emoji = (msg.payload as { emoji?: string })?.emoji;
        if (!emoji || !REACTION_EMOJIS.includes(emoji)) return;
        floatKey.current += 1;
        const item: FloatingEmoji = {
          key: floatKey.current,
          emoji,
          left: 8 + Math.random() * 84,
        };
        setFloats((prev) => [...prev.slice(-24), item]);
        setTimeout(
          () => setFloats((prev) => prev.filter((f) => f.key !== item.key)),
          2300
        );
      })
      .subscribe();
    reactChannel.current = ch;
    return () => {
      reactChannel.current = null;
      supabase.removeChannel(ch);
    };
  }, [id]);

  // Connection-drop safety net: phones lock, tabs sleep, wifi blips, and the
  // realtime stream silently dies. Refetch on wake-up and every 15s.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "hidden") return;
      refetchSession();
      refetchPlayer();
      refetchAliveCount();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    const poll = setInterval(onWake, 15000);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
      clearInterval(poll);
    };
  }, [refetchSession, refetchPlayer, refetchAliveCount]);

  // Load the active question (and my existing answer) whenever it changes.
  useEffect(() => {
    if (!session || session.status !== "live") {
      setQuestion(null);
      return;
    }
    let cancelled = false;
    (async () => {
      // Note: we can't filter on the "order" column directly — "order" is a
      // reserved word in the REST API — so fetch the session's questions and
      // pick the current one here.
      const { data } = await supabase
        .from("questions")
        .select("*")
        .eq("session_id", id);
      if (cancelled) return;
      const q = (data as Question[] | null)?.find(
        (row) => row.order === session.current_question_index
      );
      if (!q) return;
      backupRevealFired.current = false;
      revealSoundFired.current = false;
      setQuestion(q);
      setSelected(null);
      setGuessInput("");
      setLockedGuess(null);
      const playerId = localStorage.getItem(storageKey);
      if (playerId) {
        const { data: mine } = await supabase
          .from("answers")
          .select("selected_option_index, guess_value")
          .eq("question_id", q.id)
          .eq("player_id", playerId)
          .maybeSingle();
        if (!cancelled && mine) {
          setSelected(mine.selected_option_index);
          setLockedGuess(mine.guess_value);
        }
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
      refetchAliveCount();
    }
  }, [session?.question_state, question?.id, refetchAnswerCounts, refetchAliveCount]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Revival: the host brought everyone back from the dead.
  useEffect(() => {
    if (player?.alive && eliminatedOn !== null && session?.status === "live") {
      setEliminatedOn(null);
      localStorage.removeItem(elimKey);
      setRevived(true);
      sounds.survive();
      setConfetti(true);
      setTimeout(() => setConfetti(false), 2600);
      setTimeout(() => setRevived(false), 4000);
    }
  }, [player?.alive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the final leaderboard for my rank once the game ends.
  useEffect(() => {
    if (
      session?.status === "ended" &&
      (session.speed_scoring || session.ghost_mode) &&
      finalScores === null &&
      player
    ) {
      loadFinalScores(session).then(setFinalScores);
    }
  }, [session?.status, player?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reveal feedback: confetti + sting if I survived, doom sting if I'm out.
  useEffect(() => {
    if (
      session?.question_state !== "reveal" ||
      !question ||
      !player ||
      revealSoundFired.current
    ) {
      return;
    }
    const participated =
      selected !== null || lockedGuess !== null || !player.alive;
    if (!participated) return;
    revealSoundFired.current = true;
    if (question.type === "majority") {
      sounds.lockIn(); // no stakes, just a little acknowledgement
    } else if (
      player.alive &&
      (question.type === "closest" || selected === question.correct_option_index)
    ) {
      sounds.survive();
      setConfetti(true);
      setTimeout(() => setConfetti(false), 2600);
    } else if (!player.alive && eliminatedOn === session.current_question_index + 1) {
      sounds.eliminated();
    } else if (!player.alive && selected === question.correct_option_index) {
      sounds.lockIn(); // little ghost-mode "nice one"
    }
  }, [session?.question_state, player?.alive, selected, lockedGuess, question?.id, eliminatedOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown ticker (display only — the host's browser drives the reveal).
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
      if (
        remaining > 0 &&
        remaining <= 3 &&
        lastTickSecond.current !== remaining
      ) {
        lastTickSecond.current = remaining;
        sounds.tick();
      }
      // Backup reveal: normally the host's browser fires the reveal, but if
      // it's asleep or offline the game would hang. Any player can nudge it
      // 2.5s past the deadline — the database function ignores duplicates.
      if (Date.now() > endsAt + 2500 && !backupRevealFired.current) {
        backupRevealFired.current = true;
        supabase.rpc("reveal_current_question", { p_session_id: id });
      }
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [session?.question_state, session?.question_started_at, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function join(e: React.FormEvent) {
    e.preventDefault();
    unlockAudio();
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
    if (!player || !question || selected !== null) return;
    if (!player.alive && !session?.ghost_mode) return;
    if (secondsLeft <= 0) return;
    unlockAudio();
    sounds.lockIn();
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

  async function lockGuess() {
    if (!player || !question || lockedGuess !== null) return;
    if (!player.alive && !session?.ghost_mode) return;
    if (secondsLeft <= 0) return;
    const value = Number(guessInput.replace(/,/g, "").trim());
    if (!Number.isFinite(value)) return;
    unlockAudio();
    sounds.lockIn();
    setLockedGuess(value); // lock in immediately
    const { error } = await supabase.from("answers").insert({
      session_id: id,
      player_id: player.id,
      question_id: question.id,
      guess_value: value,
    });
    if (error && !error.message.includes("duplicate")) {
      setLockedGuess(null);
    }
  }

  function react(emoji: string) {
    unlockAudio();
    const now = Date.now();
    if (now - lastReactionAt.current < 600) return; // gentle rate limit
    lastReactionAt.current = now;
    reactChannel.current?.send({
      type: "broadcast",
      event: "react",
      payload: { emoji },
    });
  }

  function toggleSound() {
    unlockAudio();
    const next = !soundOn;
    setSoundOn(next);
    setMuted(!next);
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
      <Shell floats={floats} onReact={react}>
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">{session.name}</h1>
          <p className="text-4xl">🎉</p>
          <p className="text-lg">
            You&apos;re in, <span className="font-bold">{player.nickname}</span>!
          </p>
          <p className="text-slate-400">
            Hang tight — the host will start the game soon.
          </p>
          {aliveCount !== null && aliveCount > 1 && (
            <p className="text-sm text-slate-500">
              {aliveCount} players in the lobby
            </p>
          )}
        </div>
      </Shell>
    );
  }

  // Game over.
  if (session.status === "ended") {
    return (
      <Shell floats={floats} onReact={react}>
        {player.alive && <Confetti />}
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">{session.name}</h1>
          {player.alive ? (
            <>
              <p className="text-5xl">🏆</p>
              <p className="text-xl font-bold text-emerald-400">
                You survived, {player.nickname}!
              </p>
              <p className="text-slate-400">
                {aliveCount !== null && aliveCount > 0
                  ? `One of only ${aliveCount} left standing. `
                  : ""}
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
          {finalScores &&
            (() => {
              const idx = finalScores.findIndex((s) => s.player.id === player.id);
              if (idx < 0) return null;
              const mine = finalScores[idx];
              return (
                <p className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                  {session.speed_scoring
                    ? `⚡ ${mine.points} pts — `
                    : `${mine.correct} correct — `}
                  ranked <span className="font-bold">#{idx + 1}</span> of{" "}
                  {finalScores.length}
                  {!player.alive && session.ghost_mode ? " (ghosts included)" : ""}
                </p>
              );
            })()}
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
  const justEliminated =
    reveal && !player.alive && eliminatedOn === session.current_question_index + 1;

  return (
    <Shell wide floats={floats} onReact={react}>
      {confetti && <Confetti />}
      <div className="w-full space-y-4">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span className="flex items-center gap-2">
            Question {session.current_question_index + 1}
            {aliveCount !== null && (
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-emerald-300">
                ❤️ {aliveCount} left
              </span>
            )}
            {spectating && (
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-amber-300">
                👻 Spectating
              </span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className="rounded bg-slate-800 px-2 py-1 text-base"
              aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
            {asking && <CountdownRing seconds={secondsLeft} frac={frac} />}
          </span>
        </div>

        <h1 className="text-xl font-bold leading-snug pop" key={question.id}>
          {question.text}
        </h1>

        {question.type === "closest" ? (
          <div className="space-y-3">
            {asking &&
              (lockedGuess === null ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && lockGuess()}
                    placeholder="Type your number"
                    disabled={
                      secondsLeft <= 0 || (spectating && !session.ghost_mode)
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-4 text-center text-xl font-bold outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={lockGuess}
                    disabled={
                      !guessInput.trim() ||
                      secondsLeft <= 0 ||
                      (spectating && !session.ghost_mode)
                    }
                    className="shrink-0 rounded-xl bg-indigo-600 px-5 font-bold hover:bg-indigo-500 disabled:opacity-50"
                  >
                    Lock in
                  </button>
                </div>
              ) : (
                <p className="rounded-xl border border-indigo-400 bg-indigo-500/20 px-4 py-4 text-center text-xl font-bold">
                  🎯 {lockedGuess.toLocaleString()}
                </p>
              ))}
            {reveal && (
              <div className="rounded-xl border border-emerald-500 bg-emerald-500/10 px-4 py-4 text-center">
                <p className="text-sm text-slate-400">The answer was</p>
                <p className="text-3xl font-black text-emerald-300">
                  {question.numeric_answer?.toLocaleString()}
                </p>
                {lockedGuess !== null && (
                  <p className="mt-1 text-sm text-slate-300">
                    Your guess: {lockedGuess.toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {question.options.map((opt, i) => {
              const isMine = selected === i;
              const isCorrect =
                question.type === "trivia" && i === question.correct_option_index;
              const maxCount = Math.max(...answerCounts);
              const isCrowdPick =
                question.type === "majority" &&
                maxCount > 0 &&
                answerCounts[i] === maxCount;
              const pct = totalAnswers ? Math.round((answerCounts[i] / totalAnswers) * 100) : 0;

              let cls = "border-slate-700 bg-slate-800";
              if (asking && isMine) cls = "border-indigo-400 bg-indigo-500/20";
              if (reveal && isCorrect) cls = "border-emerald-500 bg-emerald-500/10";
              if (reveal && isCrowdPick) cls = "border-indigo-400 bg-indigo-500/10";
              if (reveal && question.type === "trivia" && isMine && !isCorrect)
                cls = "border-rose-500 bg-rose-500/10";

              return (
                <button
                  key={i}
                  onClick={() => answer(i)}
                  disabled={
                    !asking ||
                    selected !== null ||
                    secondsLeft <= 0 ||
                    (spectating && !session.ghost_mode)
                  }
                  className={`relative w-full overflow-hidden rounded-xl border px-4 py-4 text-left text-lg transition ${cls} ${
                    asking &&
                    selected === null &&
                    secondsLeft > 0 &&
                    (!spectating || session.ghost_mode)
                      ? "active:scale-[0.98]"
                      : ""
                  }`}
                >
                  {reveal && (
                    <div
                      className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-out ${
                        isCorrect || isCrowdPick
                          ? "bg-emerald-500/25"
                          : "bg-slate-600/30"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                  <span className="relative flex items-center justify-between">
                    <span>
                      {reveal && isCorrect ? "✅ " : ""}
                      {reveal && isCrowdPick ? "👑 " : ""}
                      {isMine ? "👉 " : ""}
                      {opt}
                    </span>
                    {reveal && <span className="text-sm text-slate-300">{pct}%</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {revived && (
          <p className="rounded-xl border border-fuchsia-500/50 bg-fuchsia-500/15 p-3 text-center font-bold text-fuchsia-300 pop">
            💫 REVIVED! You&apos;re back in the game!
          </p>
        )}

        {asking && (
          <p className="text-center text-sm text-slate-400">
            {spectating
              ? session.ghost_mode
                ? selected !== null || lockedGuess !== null
                  ? "👻 Ghost answer locked in!"
                  : "👻 Ghost mode — keep answering for pride points."
                : "Watching the survivors battle it out…"
              : selected !== null || lockedGuess !== null
              ? "Locked in! Waiting for the reveal…"
              : secondsLeft > 0
              ? question.type === "closest"
                ? "Type your best guess — the closest half survives."
                : question.type === "majority"
                ? "No wrong answers — pick a side!"
                : "Tap an answer — it locks in instantly."
              : "Time's up!"}
          </p>
        )}

        {reveal &&
          session.speed_scoring &&
          question.type === "trivia" &&
          selected === question.correct_option_index &&
          (() => {
            const mine = currentAnswers.find((a) => a.player_id === player.id);
            if (!mine) return null;
            const first = Math.min(
              ...currentAnswers.map((a) => new Date(a.answered_at).getTime())
            );
            return (
              <p className="text-center text-lg font-bold text-amber-300 pop">
                +{answerPoints(session, mine, first)} pts ⚡
              </p>
            );
          })()}

        {reveal && question.type === "majority" && selected !== null && (
          <p
            className={`rounded-xl border p-3 text-center font-bold ${
              answerCounts[selected] === Math.max(...answerCounts)
                ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            }`}
          >
            {answerCounts[selected] === Math.max(...answerCounts)
              ? "🎉 You're with the majority! (+200 pts)"
              : "😬 Bold minority pick. No eliminations this round!"}
          </p>
        )}

        {reveal && question.type !== "majority" && !spectating && (
          <p
            className={`rounded-xl border p-3 text-center font-bold ${
              player.alive
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-300"
            } ${justEliminated ? "shake" : ""}`}
          >
            {player.alive
              ? question.type === "closest"
                ? "🎯 Close enough — you're still in!"
                : "✅ You're still in!"
              : session.ghost_mode
              ? "💀 Eliminated — but your ghost fights on!"
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
  const danger = frac <= 0.3;
  return (
    <span
      className={`relative inline-flex h-12 w-12 items-center justify-center ${
        danger ? "pulse-danger" : ""
      }`}
    >
      <svg viewBox="0 0 48 48" className="absolute inset-0 -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#334155" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={danger ? "#f43f5e" : "#6366f1"}
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

function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 36 }, (_, i) => {
        const colors = ["#f43f5e", "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#eab308"];
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${Math.random() * 100}%`,
              background: colors[i % colors.length],
              animationDelay: `${Math.random() * 0.4}s`,
              animationDuration: `${1.4 + Math.random() * 1.2}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function Shell({
  children,
  wide,
  floats,
  onReact,
}: {
  children: React.ReactNode;
  wide?: boolean;
  floats?: FloatingEmoji[];
  onReact?: (emoji: string) => void;
}) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-5">
      <div className={`w-full ${wide ? "max-w-lg" : "max-w-sm"}`}>{children}</div>

      {floats && floats.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 top-0 z-40 overflow-hidden">
          {floats.map((f) => (
            <span key={f.key} className="float-emoji" style={{ left: `${f.left}%` }}>
              {f.emoji}
            </span>
          ))}
        </div>
      )}

      {onReact && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center gap-3 pb-4">
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => onReact(e)}
              className="rounded-full border border-slate-700 bg-slate-900/90 px-3 py-2 text-xl active:scale-125 transition"
              aria-label={`React ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
