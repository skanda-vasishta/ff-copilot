alter table public.leagues
  add column team_count integer,
  add column playoff_team_count integer,
  add column regular_season_weeks integer,
  add column scoring_type text,
  add column reception_points numeric,
  add column scoring_format_label text,
  add column lineup_slot_counts jsonb not null default '{}'::jsonb,
  add column league_settings jsonb not null default '{}'::jsonb;

alter table public.fantasy_teams
  add column wins integer,
  add column losses integer,
  add column ties integer,
  add column points_for numeric,
  add column points_against numeric,
  add column standing integer,
  add column final_standing integer,
  add column playoff_pct numeric;

