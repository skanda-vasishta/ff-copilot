create or replace view public.player_directory with (security_invoker = true) as
with latest_espn as (
  select distinct on (player_id, season) *
  from public.player_snapshots
  where source = 'espn'
  order by player_id, season, fetched_at desc
), latest_projections as (
  select distinct on (player_id, season, source)
    player_id, season, source, projected_total_points, source_updated_at, fetched_at
  from public.player_snapshots
  where projected_total_points is not null
    and (raw_payload ->> 'scoring_format' = 'ppr' or source = 'espn')
  order by player_id, season, source, fetched_at desc
), projection_summary as (
  select player_id, season,
    avg(projected_total_points) projected_total_points,
    avg(projected_total_points) / 17.0 projected_average_points,
    count(*) projection_source_count,
    jsonb_object_agg(source, jsonb_build_object(
      'projected_total_points', projected_total_points,
      'source_updated_at', source_updated_at,
      'fetched_at', fetched_at
    )) projection_sources,
    max(fetched_at) projection_fetched_at
  from latest_projections
  group by player_id, season
), latest_comparable_overall_rankings as (
  select distinct on (player_id, season, source)
    player_id, season, source, overall_rank rank_value
  from public.player_rankings
  where overall_rank is not null
    and overall_rank > 0
    and lower(scoring_format) = 'ppr'
    and ranking_type in ('current_draft_rank', 'expert_consensus_rank')
  order by player_id, season, source, fetched_at desc
), ranking_summary as (
  select player_id, season, avg(rank_value) average_rank,
    percentile_cont(0.5) within group (order by rank_value) median_rank,
    min(rank_value) minimum_rank, max(rank_value) maximum_rank,
    count(*) source_count
  from latest_comparable_overall_rankings
  group by player_id, season
)
select p.id, p.name, p.position, p.nfl_team, p.active, e.season, e.week,
  e.injury_status, e.injured, e.total_points, e.average_points,
  c.projected_total_points, c.projected_average_points,
  e.percent_owned, e.percent_started, e.fetched_at,
  r.average_rank, r.median_rank, r.minimum_rank, r.maximum_rank, coalesce(r.source_count, 0) source_count,
  c.projection_source_count, c.projection_sources, c.projection_fetched_at
from public.players p
left join latest_espn e on e.player_id = p.id
left join projection_summary c on c.player_id = p.id and c.season = e.season
left join ranking_summary r on r.player_id = p.id and r.season = e.season;

refresh materialized view public.player_directory_cache;
