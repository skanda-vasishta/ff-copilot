create materialized view public.player_directory_cache as
select * from public.player_directory;

create index player_directory_cache_season_name_idx
  on public.player_directory_cache(season, name);
create index player_directory_cache_season_median_rank_idx
  on public.player_directory_cache(season, median_rank nulls last);
create index player_directory_cache_season_projection_idx
  on public.player_directory_cache(season, projected_total_points desc nulls last);
create index player_directory_cache_season_position_rank_idx
  on public.player_directory_cache(season, position, median_rank nulls last);

grant select on public.player_directory_cache to authenticated, service_role;

create or replace function public.refresh_player_directory_cache()
returns void
language sql
security definer
set search_path = public
as $$ refresh materialized view public.player_directory_cache $$;

revoke all on function public.refresh_player_directory_cache() from public, authenticated;
grant execute on function public.refresh_player_directory_cache() to service_role;
