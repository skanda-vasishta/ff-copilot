create table public.user_active_scopes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.user_active_scopes enable row level security;

insert into public.user_active_scopes (user_id, team_id)
select distinct on (user_id) user_id, team_id
from public.user_team_selections
order by user_id, created_at desc
on conflict (user_id) do nothing;

create policy "users manage own active scope" on public.user_active_scopes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and exists (
      select 1
      from public.fantasy_teams ft
      join public.user_leagues ul on ul.league_id = ft.league_id
      where ft.id = team_id and ul.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.user_active_scopes to authenticated;
grant all privileges on public.user_active_scopes to service_role;
