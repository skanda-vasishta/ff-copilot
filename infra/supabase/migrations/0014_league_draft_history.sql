create table public.league_draft_picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  overall_pick integer not null check (overall_pick > 0),
  round_number integer not null check (round_number > 0),
  round_pick integer not null check (round_pick > 0),
  team_id uuid references public.fantasy_teams(id) on delete set null,
  team_external_id text,
  team_name text,
  player_id uuid references public.players(id) on delete set null,
  player_external_id text not null,
  player_name text not null,
  player_position text,
  nfl_team text,
  bid_amount numeric,
  keeper_status boolean,
  nominating_team_external_id text,
  nominating_team_name text,
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (league_id, overall_pick),
  unique (league_id, round_number, round_pick)
);

create index league_draft_picks_round_idx
  on public.league_draft_picks(league_id, round_number, round_pick);
create index league_draft_picks_team_idx
  on public.league_draft_picks(league_id, team_id, overall_pick);
create index league_draft_picks_player_idx
  on public.league_draft_picks(player_id, league_id);

alter table public.league_draft_picks enable row level security;

create policy "users read linked league draft picks"
on public.league_draft_picks for select to authenticated using (
  exists (
    select 1 from public.user_leagues ul
    where ul.league_id = league_draft_picks.league_id
      and ul.user_id = auth.uid()
  )
);

grant select on public.league_draft_picks to authenticated;
grant all privileges on public.league_draft_picks to service_role;
