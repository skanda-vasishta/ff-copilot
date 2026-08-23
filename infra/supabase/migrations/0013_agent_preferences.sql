alter table public.agent_threads drop column if exists model_id;

create table public.agent_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  model_id text not null default 'gpt-5.6-luna',
  reasoning_effort text not null default 'low',
  updated_at timestamptz not null default now()
);

alter table public.agent_preferences enable row level security;

create policy "users manage own agent preferences" on public.agent_preferences
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.agent_preferences to authenticated;
grant all privileges on public.agent_preferences to service_role;
