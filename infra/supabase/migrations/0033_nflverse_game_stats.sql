-- Globally cached NFL game facts derived from attributed nflverse play-by-play.
-- Refreshes are user-triggered through the factual API; no scheduled job owns
-- these tables.

create table public.nfl_games (
  game_id text primary key,
  season integer not null check (season between 1999 and 2100),
  week integer not null check (week between 1 and 25),
  season_type text not null,
  game_date date,
  home_team text not null,
  away_team text not null,
  home_score integer,
  away_score integer,
  status text not null default 'unknown',
  source text not null default 'nflverse',
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);
create index nfl_games_season_week_idx on public.nfl_games(season, week, game_date);

create table public.nfl_player_game_stats (
  game_id text not null references public.nfl_games(game_id) on delete cascade,
  gsis_id text not null,
  player_id uuid references public.players(id) on delete set null,
  player_name text not null,
  team text,
  opponent_team text,
  position text,
  stats jsonb not null default '{}'::jsonb,
  source text not null default 'nflverse',
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (game_id, gsis_id)
);
create index nfl_player_game_stats_player_idx on public.nfl_player_game_stats(player_id, game_id);
create index nfl_player_game_stats_gsis_idx on public.nfl_player_game_stats(gsis_id, game_id);

-- Prevent two user refreshes from processing the same nflverse season at once.
create unique index sync_requests_one_active_nflverse_season_idx
  on public.sync_requests(provider, season)
  where provider = 'nflverse' and status in ('pending', 'running');

alter table public.nfl_games enable row level security;
alter table public.nfl_player_game_stats enable row level security;
create policy "authenticated read nfl games" on public.nfl_games
  for select to authenticated using (true);
create policy "authenticated read nfl player game stats" on public.nfl_player_game_stats
  for select to authenticated using (true);

grant select on public.nfl_games, public.nfl_player_game_stats to authenticated;
grant all privileges on public.nfl_games, public.nfl_player_game_stats to service_role;
