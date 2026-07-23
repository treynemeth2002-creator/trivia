// Shared row types matching supabase/schema.sql

export type Session = {
  id: string;
  name: string;
  host_key: string;
  pack_id: string;
  expected_players: number;
  status: "waiting" | "live" | "ended";
  current_question_index: number;
  question_state: "idle" | "asking" | "reveal";
  question_started_at: string | null;
  seconds_per_question: number;
  created_at: string;
};

export type Player = {
  id: string;
  session_id: string;
  nickname: string;
  alive: boolean;
  joined_at: string;
};

export type Question = {
  id: string;
  session_id: string;
  pack_id: string;
  text: string;
  options: string[];
  correct_option_index: number;
  order: number;
};
