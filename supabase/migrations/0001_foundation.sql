create extension if not exists pgcrypto;

create type public.sync_kind as enum ('global', 'league', 'legacy_import');
create type public.sync_status as enum ('pending', 'running', 'succeeded', 'partial', 'failed');

create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text,
  nfl_team text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index players_name_search_idx on public.players using gin (to_tsvector('simple', name));
create index players_position_team_idx on public.players(position, nfl_team);

create table public.player_external_ids (
  player_id uuid not null references public.players(id) on delete cascade,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  primary key (provider, external_id),
  unique (player_id, provider)
);

create table public.player_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  source text not null,
  season integer not null check (season between 2000 and 2100),
  week integer check (week between 1 and 25),
  position_rank integer,
  injury_status text,
  injured boolean,
  total_points numeric,
  average_points numeric,
  projected_total_points numeric,
  projected_average_points numeric,
  percent_owned numeric,
  percent_started numeric,
  raw_payload jsonb not null default '{}'::jsonb,
  data_hash text not null,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique nulls not distinct (player_id, source, season, week, data_hash)
);
create index player_snapshots_lookup_idx on public.player_snapshots(player_id, season, week, fetched_at desc);

create table public.player_rankings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  source text not null,
  season integer not null,
  week integer,
  scoring_format text not null default 'unknown',
  ranking_type text not null,
  overall_rank numeric,
  position_rank numeric,
  fetched_at timestamptz not null default now(),
  unique nulls not distinct (player_id, source, season, week, scoring_format, ranking_type, overall_rank, position_rank)
);
create index player_rankings_lookup_idx on public.player_rankings(player_id, season, week, ranking_type, fetched_at desc);

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  source text not null,
  external_document_id text,
  title text,
  content text not null,
  source_url text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null
);
create unique index source_documents_identity_idx on public.source_documents(player_id, source, content_hash);
create index source_documents_player_idx on public.source_documents(player_id, fetched_at desc);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  season integer not null,
  name text,
  status public.sync_status not null default 'pending',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, external_id, season)
);

create table public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  external_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, external_id)
);

create table public.roster_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  season integer not null,
  week integer,
  fetched_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  data_hash text not null,
  unique nulls not distinct (team_id, season, week, data_hash)
);

create table public.roster_players (
  roster_snapshot_id uuid not null references public.roster_snapshots(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  lineup_slot text,
  acquisition_type text,
  primary key (roster_snapshot_id, player_id)
);

create table public.user_leagues (
  user_id uuid not null references auth.users(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, league_id)
);

create table public.user_team_selections (
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

create table public.sync_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  kind public.sync_kind not null,
  provider text not null,
  external_id text,
  season integer not null,
  week integer,
  status public.sync_status not null default 'pending',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);
create index sync_requests_pending_idx on public.sync_requests(status, requested_at);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.sync_requests(id) on delete set null,
  kind public.sync_kind not null,
  provider text not null,
  season integer not null,
  week integer,
  status public.sync_status not null default 'running',
  records_read integer not null default 0,
  records_written integer not null default 0,
  source_errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create or replace view public.player_directory with (security_invoker = true) as
with latest as (
  select distinct on (player_id, season) *
  from public.player_snapshots
  order by player_id, season, fetched_at desc
), ranking_summary as (
  select player_id, season, avg(overall_rank) average_rank,
    percentile_cont(0.5) within group (order by overall_rank) median_rank,
    min(overall_rank) minimum_rank, max(overall_rank) maximum_rank,
    count(distinct source) source_count
  from public.player_rankings where overall_rank is not null
  group by player_id, season
)
select p.id, p.name, p.position, p.nfl_team, p.active, l.season, l.week,
  l.injury_status, l.injured, l.total_points, l.average_points,
  l.projected_total_points, l.projected_average_points,
  l.percent_owned, l.percent_started, l.fetched_at,
  r.average_rank, r.median_rank, r.minimum_rank, r.maximum_rank, coalesce(r.source_count, 0) source_count
from public.players p
left join latest l on l.player_id = p.id
left join ranking_summary r on r.player_id = p.id and r.season = l.season;

alter table public.players enable row level security;
alter table public.player_external_ids enable row level security;
alter table public.player_snapshots enable row level security;
alter table public.player_rankings enable row level security;
alter table public.source_documents enable row level security;
alter table public.leagues enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.roster_snapshots enable row level security;
alter table public.roster_players enable row level security;
alter table public.user_leagues enable row level security;
alter table public.user_team_selections enable row level security;
alter table public.sync_requests enable row level security;
alter table public.sync_runs enable row level security;

create policy "authenticated read players" on public.players for select to authenticated using (true);
create policy "authenticated read external ids" on public.player_external_ids for select to authenticated using (true);
create policy "authenticated read snapshots" on public.player_snapshots for select to authenticated using (true);
create policy "authenticated read rankings" on public.player_rankings for select to authenticated using (true);
create policy "authenticated read sources" on public.source_documents for select to authenticated using (true);
create policy "users read linked leagues" on public.leagues for select to authenticated using (
  exists (select 1 from public.user_leagues ul where ul.league_id = id and ul.user_id = auth.uid())
);
create policy "users read linked league teams" on public.fantasy_teams for select to authenticated using (
  exists (select 1 from public.user_leagues ul where ul.league_id = league_id and ul.user_id = auth.uid())
);
create policy "users read linked rosters" on public.roster_snapshots for select to authenticated using (
  exists (select 1 from public.fantasy_teams ft join public.user_leagues ul on ul.league_id = ft.league_id
    where ft.id = team_id and ul.user_id = auth.uid())
);
create policy "users read linked roster players" on public.roster_players for select to authenticated using (
  exists (select 1 from public.roster_snapshots rs join public.fantasy_teams ft on ft.id = rs.team_id
    join public.user_leagues ul on ul.league_id = ft.league_id
    where rs.id = roster_snapshot_id and ul.user_id = auth.uid())
);
create policy "users manage own leagues" on public.user_leagues for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own teams" on public.user_team_selections for all to authenticated
  using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (
      select 1 from public.fantasy_teams ft join public.user_leagues ul on ul.league_id = ft.league_id
      where ft.id = team_id and ul.user_id = auth.uid()
    )
  );
create policy "users read own sync requests" on public.sync_requests for select to authenticated
  using (requested_by = auth.uid());
create policy "users create own sync requests" on public.sync_requests for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending');
create policy "authenticated read sync runs" on public.sync_runs for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select on public.players, public.player_external_ids, public.player_snapshots,
  public.player_rankings, public.source_documents, public.leagues, public.fantasy_teams,
  public.roster_snapshots, public.roster_players, public.sync_runs, public.player_directory to authenticated;
grant select, insert, delete on public.user_leagues, public.user_team_selections to authenticated;
grant select, insert on public.sync_requests to authenticated;

-- The project is created with automatic table exposure disabled. Grant the
-- operator role explicitly; its secret is restricted to ingestion workflows.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
