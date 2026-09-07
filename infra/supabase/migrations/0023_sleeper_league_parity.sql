alter table public.leagues add column league_series_id text;
alter type public.draft_session_source add value if not exists 'sleeper_live';
update public.leagues set league_series_id = external_id where league_series_id is null;
alter table public.leagues alter column league_series_id set not null;
create index leagues_provider_series_idx on public.leagues(provider, league_series_id, season desc);

create or replace function public.link_league_history(p_league_id uuid)
returns setof public.leagues language plpgsql security definer set search_path = public as $$
declare anchor public.leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select l.* into anchor from public.leagues l join public.user_leagues ul on ul.league_id = l.id
    where l.id = p_league_id and ul.user_id = auth.uid();
  if not found then return; end if;
  insert into public.user_leagues(user_id, league_id)
    select auth.uid(), l.id from public.leagues l
    where l.provider = anchor.provider and l.league_series_id = anchor.league_series_id
    on conflict do nothing;
  return query select l.* from public.leagues l
    where l.provider = anchor.provider and l.league_series_id = anchor.league_series_id order by l.season desc;
end; $$;
revoke all on function public.link_league_history(uuid) from public;
grant execute on function public.link_league_history(uuid) to authenticated;

create or replace view public.player_directory with (security_invoker = true) as
with latest_base as (
  select distinct on (player_id, season) * from public.player_snapshots
  where source in ('espn', 'sleeper')
  order by player_id, season, case source when 'espn' then 0 else 1 end, fetched_at desc
), latest_projections as (
  select distinct on (player_id, season, source)
    player_id, season, source, projected_total_points, source_updated_at, fetched_at
  from public.player_snapshots
  where projected_total_points is not null and (raw_payload ->> 'scoring_format' = 'ppr' or source = 'espn')
  order by player_id, season, source, fetched_at desc
), projection_summary as (
  select player_id, season, avg(projected_total_points) projected_total_points,
    avg(projected_total_points) / 17.0 projected_average_points, count(*) projection_source_count,
    jsonb_object_agg(source, jsonb_build_object('projected_total_points', projected_total_points,
      'source_updated_at', source_updated_at, 'fetched_at', fetched_at)) projection_sources,
    max(fetched_at) projection_fetched_at
  from latest_projections group by player_id, season
), latest_comparable_overall_rankings as (
  select distinct on (player_id, season, source) player_id, season, source, overall_rank rank_value
  from public.player_rankings
  where overall_rank is not null and overall_rank > 0 and lower(scoring_format) = 'ppr'
    and ranking_type in ('current_draft_rank', 'platform_adp', 'expert_consensus_rank')
  order by player_id, season, source, fetched_at desc
), ranking_summary as (
  select player_id, season, avg(rank_value) average_rank,
    percentile_cont(0.5) within group (order by rank_value) median_rank,
    min(rank_value) minimum_rank, max(rank_value) maximum_rank, count(*) source_count
  from latest_comparable_overall_rankings group by player_id, season
)
select p.id, p.name, p.position, p.nfl_team, p.active, b.season, b.week,
  b.injury_status, b.injured, b.total_points, b.average_points,
  c.projected_total_points, c.projected_average_points, b.percent_owned, b.percent_started, b.fetched_at,
  r.average_rank, r.median_rank, r.minimum_rank, r.maximum_rank, coalesce(r.source_count, 0) source_count,
  c.projection_source_count, c.projection_sources, c.projection_fetched_at
from public.players p left join latest_base b on b.player_id = p.id
left join projection_summary c on c.player_id = p.id and c.season = b.season
left join ranking_summary r on r.player_id = p.id and r.season = b.season;

refresh materialized view public.player_directory_cache;

create or replace function public.sync_espn_draft_snapshot(p_session_id uuid, p_picks jsonb)
returns public.draft_sessions language plpgsql security invoker set search_path = public as $$
declare session_row public.draft_sessions; pick_row jsonb; overall_no integer; player_uuid uuid;
  participant_uuid uuid; next_pick integer; total_picks integer;
begin
  select * into session_row from public.draft_sessions where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'draft_not_found'; end if;
  if session_row.source::text not in ('espn_live', 'sleeper_live') then raise exception 'not_connected_live_draft'; end if;
  if jsonb_typeof(p_picks) <> 'array' then raise exception 'invalid_draft_snapshot'; end if;
  total_picks := cardinality(session_row.team_order) * session_row.round_count;
  delete from public.draft_picks where draft_session_id = session_row.id;
  for pick_row in select value from jsonb_array_elements(p_picks) loop
    overall_no := (pick_row->>'overall_pick')::integer; player_uuid := (pick_row->>'player_id')::uuid;
    if overall_no < 1 or overall_no > total_picks then raise exception 'invalid_draft_pick'; end if;
    participant_uuid := public.draft_team_for_pick(session_row.team_order, session_row.draft_type, overall_no);
    insert into public.draft_picks(draft_session_id, overall_pick, round_number, round_pick, draft_participant_id, player_id)
      values (session_row.id, overall_no, ((overall_no - 1) / cardinality(session_row.team_order)) + 1,
        ((overall_no - 1) % cardinality(session_row.team_order)) + 1, participant_uuid, player_uuid);
  end loop;
  select coalesce(min(slot), total_picks + 1) into next_pick from generate_series(1, total_picks) slot
    where not exists (select 1 from public.draft_picks dp where dp.draft_session_id = session_row.id and dp.overall_pick = slot);
  update public.draft_sessions set current_overall_pick = next_pick, revision = revision + 1,
    status = case when next_pick > total_picks then 'completed'::public.draft_session_status else 'active'::public.draft_session_status end,
    completed_at = case when next_pick > total_picks then now() else null end, updated_at = now()
    where id = session_row.id returning * into session_row;
  return session_row;
end; $$;
grant execute on function public.sync_espn_draft_snapshot(uuid,jsonb) to authenticated;

create or replace function public.record_draft_pick(p_session_id uuid, p_player_id uuid, p_overall_pick integer, p_expected_revision integer)
returns public.draft_sessions language plpgsql security invoker set search_path = public as $$
declare session_row public.draft_sessions; team_id uuid; next_pick integer; total_picks integer;
begin
  select * into session_row from public.draft_sessions where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'draft_not_found'; end if;
  if session_row.revision <> p_expected_revision then raise exception 'draft_revision_conflict'; end if;
  total_picks := cardinality(session_row.team_order) * session_row.round_count;
  if p_overall_pick < 1 or p_overall_pick > total_picks then raise exception 'invalid_draft_pick'; end if;
  team_id := public.draft_team_for_pick(session_row.team_order, session_row.draft_type, p_overall_pick);
  if session_row.source::text in ('espn_live', 'sleeper_live') then
    insert into public.draft_picks(draft_session_id, overall_pick, round_number, round_pick, draft_participant_id, player_id)
      values (session_row.id, p_overall_pick, ((p_overall_pick - 1) / cardinality(session_row.team_order)) + 1,
        ((p_overall_pick - 1) % cardinality(session_row.team_order)) + 1, team_id, p_player_id);
  else
    insert into public.draft_picks(draft_session_id, overall_pick, round_number, round_pick, fantasy_team_id, player_id)
      values (session_row.id, p_overall_pick, ((p_overall_pick - 1) / cardinality(session_row.team_order)) + 1,
        ((p_overall_pick - 1) % cardinality(session_row.team_order)) + 1, team_id, p_player_id);
  end if;
  select coalesce(min(slot), total_picks + 1) into next_pick from generate_series(1, total_picks) slot
    where not exists (select 1 from public.draft_picks dp where dp.draft_session_id = session_row.id and dp.overall_pick = slot);
  update public.draft_sessions set current_overall_pick = next_pick, revision = revision + 1,
    status = case when next_pick > total_picks then 'completed'::public.draft_session_status else 'active'::public.draft_session_status end,
    completed_at = case when next_pick > total_picks then now() else null end, updated_at = now()
    where id = session_row.id returning * into session_row;
  return session_row;
end; $$;
