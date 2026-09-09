alter table public.leagues add column current_week integer;

create table public.league_matchups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  season integer not null check (season between 2000 and 2100),
  week integer not null check (week between 1 and 25),
  matchup_external_id text not null,
  home_team_id uuid references public.fantasy_teams(id) on delete cascade,
  away_team_id uuid references public.fantasy_teams(id) on delete cascade,
  home_score numeric,
  away_score numeric,
  home_projected numeric,
  away_projected numeric,
  status text not null default 'scheduled',
  fetched_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  unique (league_id, season, week, matchup_external_id)
);

create index league_matchups_week_idx on public.league_matchups(league_id, season, week);
alter table public.league_matchups enable row level security;
create policy "users read linked league matchups" on public.league_matchups for select to authenticated using (
  exists (select 1 from public.user_leagues ul where ul.league_id = league_id and ul.user_id = auth.uid())
);
