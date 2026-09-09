create table public.recommendation_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  workflow text not null check (workflow in ('free-agents', 'trades')),
  position text not null check (position in ('ALL', 'QB', 'RB', 'WR', 'TE')),
  prompt text not null default '',
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  league_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, team_id, workflow)
);

create index recommendation_results_team_idx
  on public.recommendation_results(team_id, updated_at desc);

alter table public.recommendation_results enable row level security;

create policy "users manage own recommendation results"
  on public.recommendation_results for all to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_team_selections selection
      where selection.user_id = auth.uid() and selection.team_id = recommendation_results.team_id
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.user_team_selections selection
      where selection.user_id = auth.uid() and selection.team_id = recommendation_results.team_id
    )
  );

grant select, insert, update, delete on public.recommendation_results to authenticated;
grant all privileges on public.recommendation_results to service_role;
