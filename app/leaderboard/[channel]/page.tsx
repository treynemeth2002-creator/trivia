"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Player, Session } from "@/lib/types";

type ChannelStats = {
  nickname: string;
  games: number;
  wins: number;
};

export default function ChannelLeaderboardPage() {
  const params = useParams<{ channel: string }>();
  const channel = decodeURIComponent(params.channel).toLowerCase();
  const [stats, setStats] = useState<ChannelStats[] | null>(null);
  const [gameCount, setGameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sessions, error: sessionsError } = await supabase
        .from("sessions")
        .select("id")
        .eq("channel", channel)
        .eq("status", "ended");
      if (sessionsError) {
        setError(sessionsError.message);
        return;
      }
      const ids = ((sessions as Pick<Session, "id">[]) ?? []).map((s) => s.id);
      setGameCount(ids.length);
      if (ids.length === 0) {
        setStats([]);
        return;
      }
      const { data: players } = await supabase
        .from("players")
        .select("nickname, alive, session_id")
        .in("session_id", ids);

      const byNick = new Map<string, ChannelStats>();
      for (const p of (players as Pick<Player, "nickname" | "alive" | "session_id">[]) ?? []) {
        const key = p.nickname.trim().toLowerCase();
        const entry =
          byNick.get(key) ?? { nickname: p.nickname.trim(), games: 0, wins: 0 };
        entry.games += 1;
        if (p.alive) entry.wins += 1;
        byNick.set(key, entry);
      }
      setStats(
        [...byNick.values()].sort(
          (a, b) => b.wins - a.wins || b.games - a.games || a.nickname.localeCompare(b.nickname)
        )
      );
    })();
  }, [channel]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-6 pt-12">
      <div className="w-full max-w-md space-y-5">
        <header className="text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-indigo-400">
            All-time leaderboard
          </p>
          <h1 className="text-3xl font-black">{channel}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {gameCount} finished game{gameCount === 1 ? "" : "s"} · same nickname
            = same legend
          </p>
        </header>

        {error && (
          <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-center text-sm text-rose-200">
            {error}
          </p>
        )}

        {stats === null && !error && (
          <p className="text-center text-slate-400">Loading…</p>
        )}

        {stats && stats.length === 0 && (
          <p className="text-center text-slate-400">
            No finished games for this channel yet. Play one and the legends
            appear here.
          </p>
        )}

        {stats && stats.length > 0 && (
          <ol className="space-y-1.5">
            {stats.slice(0, 25).map((s, i) => (
              <li
                key={s.nickname.toLowerCase()}
                className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
                  i === 0
                    ? "border-amber-400/60 bg-amber-500/10"
                    : "border-slate-800 bg-slate-900"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="w-6 text-right text-slate-500">{i + 1}.</span>
                  <span className="font-semibold">
                    {i === 0 ? "👑 " : ""}
                    {s.nickname}
                  </span>
                </span>
                <span className="text-sm text-slate-300">
                  {s.wins} win{s.wins === 1 ? "" : "s"} · {s.games} game
                  {s.games === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
