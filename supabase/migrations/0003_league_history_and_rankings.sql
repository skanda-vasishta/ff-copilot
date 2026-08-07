create or replace function public.link_league_history(p_league_id uuid)
returns setof public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  anchor public.leagues%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select l.* into anchor
  from public.leagues l
  join public.user_leagues ul on ul.league_id = l.id
  where l.id = p_league_id and ul.user_id = auth.uid();

  if not found then
    return;
  end if;

  insert into public.user_leagues(user_id, league_id)
  select auth.uid(), l.id
  from public.leagues l
  where l.provider = anchor.provider and l.external_id = anchor.external_id
  on conflict do nothing;

  return query
  select l.*
  from public.leagues l
  where l.provider = anchor.provider and l.external_id = anchor.external_id
  order by l.season desc;
end;
$$;

revoke all on function public.link_league_history(uuid) from public;
grant execute on function public.link_league_history(uuid) to authenticated;

create or replace view public.player_directory with (security_invoker = true) as
with latest as (
  select distinct on (player_id, season) *
  from public.player_snapshots
  order by player_id, season, fetched_at desc
), latest_rankings as (
  select distinct on (player_id, season, source, scoring_format, ranking_type)
    player_id, season, source, coalesce(nullif(overall_rank, 0), nullif(position_rank, 0)) rank_value
  from public.player_rankings
  where coalesce(nullif(overall_rank, 0), nullif(position_rank, 0)) is not null
  order by player_id, season, source, scoring_format, ranking_type, fetched_at desc
), ranking_summary as (
  select player_id, season, avg(rank_value) average_rank,
    percentile_cont(0.5) within group (order by rank_value) median_rank,
    min(rank_value) minimum_rank, max(rank_value) maximum_rank,
    count(distinct source) source_count
  from latest_rankings
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
