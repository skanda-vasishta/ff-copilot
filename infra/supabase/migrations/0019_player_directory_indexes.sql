create index if not exists player_snapshots_latest_source_idx
  on public.player_snapshots(source, player_id, season, fetched_at desc);

create index if not exists player_snapshots_latest_projection_idx
  on public.player_snapshots(player_id, season, source, fetched_at desc)
  where projected_total_points is not null;

create index if not exists player_rankings_latest_source_idx
  on public.player_rankings(player_id, season, source, scoring_format, ranking_type, fetched_at desc);
