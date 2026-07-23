"use client";

import { useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; sessionCount: number }
  | { status: "error"; message: string };

export default function Home() {
  const [check, setCheck] = useState<CheckState>({ status: "idle" });

  async function testConnection() {
    setCheck({ status: "checking" });
    const { count, error } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true });
    if (error) {
      setCheck({ status: "error", message: error.message });
    } else {
      setCheck({ status: "ok", sessionCount: count ?? 0 });
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold">Live Trivia</h1>
        <p className="mt-2 text-slate-400">
          Phase 1 setup check — confirm the database is connected.
        </p>
        <a
          href="/host"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-6 py-3 font-semibold hover:bg-emerald-500"
        >
          Host a session →
        </a>
      </div>

      {!supabaseConfigured && (
        <div className="max-w-md rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
          <p className="font-semibold">Supabase isn&apos;t configured yet.</p>
          <p className="mt-1 text-sm">
            Copy <code>.env.local.example</code> to <code>.env.local</code>,
            fill in your Supabase URL and anon key, then restart the dev
            server. Full steps are in the README.
          </p>
        </div>
      )}

      <button
        onClick={testConnection}
        disabled={check.status === "checking"}
        className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold hover:bg-indigo-500 disabled:opacity-50"
      >
        {check.status === "checking" ? "Checking…" : "Test Supabase connection"}
      </button>

      {check.status === "ok" && (
        <div className="max-w-md rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-emerald-200">
          <p className="font-semibold">✅ Connected!</p>
          <p className="mt-1 text-sm">
            The <code>sessions</code> table exists and currently has{" "}
            {check.sessionCount} row{check.sessionCount === 1 ? "" : "s"}.
            Phase 1 setup is working — ready to build the host flow.
          </p>
        </div>
      )}

      {check.status === "error" && (
        <div className="max-w-md rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">
          <p className="font-semibold">❌ Connection failed</p>
          <p className="mt-1 break-words text-sm">{check.message}</p>
          <p className="mt-2 text-sm">
            Usual causes: the schema SQL hasn&apos;t been run yet in Supabase,
            or the URL/key in <code>.env.local</code> is wrong.
          </p>
        </div>
      )}
    </main>
  );
}
