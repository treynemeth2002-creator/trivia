"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { packs } from "@/lib/packs";

export default function HostCreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [packId, setPackId] = useState(packs[0].pack_id);
  const [expectedPlayers, setExpectedPlayers] = useState(50);
  const [ghostMode, setGhostMode] = useState(true);
  const [revivalEnabled, setRevivalEnabled] = useState(true);
  const [speedScoring, setSpeedScoring] = useState(true);
  const [channel, setChannel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createSession(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);

    const pack = packs.find((p) => p.pack_id === packId)!;
    const hostKey = crypto.randomUUID();

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        name: name.trim() || "Trivia Night",
        host_key: hostKey,
        pack_id: pack.pack_id,
        expected_players: expectedPlayers,
        ghost_mode: ghostMode,
        revival_enabled: revivalEnabled,
        speed_scoring: speedScoring,
        channel: channel.trim().toLowerCase() || null,
      })
      .select()
      .single();

    if (sessionError || !session) {
      setError(sessionError?.message ?? "Could not create session");
      setCreating(false);
      return;
    }

    const { error: questionsError } = await supabase.from("questions").insert(
      pack.questions.map((q, i) => ({
        pack_id: pack.pack_id,
        session_id: session.id,
        text: q.text,
        options: q.options,
        correct_option_index: q.correct_option_index,
        order: i,
      }))
    );

    if (questionsError) {
      setError(questionsError.message);
      setCreating(false);
      return;
    }

    // Remember that this browser is the host of this session.
    localStorage.setItem(`trivia_host_key_${session.id}`, hostKey);
    router.push(`/host/${session.id}`);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <form
        onSubmit={createSession}
        className="w-full max-w-md space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-6"
      >
        <div>
          <h1 className="text-2xl font-bold">New Trivia Session</h1>
          <p className="mt-1 text-sm text-slate-400">
            Set it up, get your links, then start when everyone&apos;s in.
          </p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">Session name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Friday Trivia Night"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">Question pack</span>
          <select
            value={packId}
            onChange={(e) => setPackId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-indigo-500"
          >
            {packs.map((p) => (
              <option key={p.pack_id} value={p.pack_id}>
                {p.name} ({p.questions.length} questions)
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-300">
            Expected players (rough guess is fine)
          </span>
          <input
            type="number"
            min={1}
            max={1000}
            value={expectedPlayers}
            onChange={(e) => setExpectedPlayers(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-indigo-500"
          />
        </label>

        <fieldset className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-300">
            Game options
          </legend>
          <Toggle
            checked={ghostMode}
            onChange={setGhostMode}
            label="👻 Ghost mode"
            hint="Eliminated players keep answering for pride points instead of just watching"
          />
          <Toggle
            checked={revivalEnabled}
            onChange={setRevivalEnabled}
            label="💫 Revival button"
            hint="You get a one-click 'revive everyone' button to reset the tension mid-game"
          />
          <Toggle
            checked={speedScoring}
            onChange={setSpeedScoring}
            label="⚡ Speed scoring"
            hint="Faster correct answers earn more points; reveals call out the fastest player"
          />
          <label className="block pt-1">
            <span className="text-sm text-slate-300">
              Channel name{" "}
              <span className="text-slate-500">
                (optional — builds an all-time leaderboard across your games)
              </span>
            </span>
            <input
              type="text"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="yourtwitchname"
              maxLength={32}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 outline-none focus:border-indigo-500"
            />
          </label>
        </fieldset>

        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={creating}
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create session"}
        </button>
      </form>
    </main>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-indigo-500"
      />
      <span>
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
