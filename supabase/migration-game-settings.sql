-- Game-settings migration: host-selectable options per session.
-- Paste this whole file into the Supabase SQL Editor and click "Run".

alter table sessions
  add column if not exists ghost_mode boolean not null default false,
  add column if not exists revival_enabled boolean not null default false,
  add column if not exists speed_scoring boolean not null default false,
  add column if not exists channel text;

-- Lets the leaderboard page find a channel's finished games quickly.
create index if not exists sessions_channel_idx on sessions(channel) where channel is not null;
