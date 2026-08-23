create table public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null default 'New conversation',
  league_id uuid references public.leagues(id) on delete set null,
  team_id uuid references public.fantasy_teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_threads_user_updated_idx on public.agent_threads(user_id, updated_at desc);

create table public.agent_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.agent_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  created_at timestamptz not null default now()
);

create index agent_messages_thread_order_idx on public.agent_messages(thread_id, id);

alter table public.agent_threads enable row level security;
alter table public.agent_messages enable row level security;

create policy "users manage own agent threads" on public.agent_threads
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (league_id is null or exists (
      select 1 from public.user_leagues ul
      where ul.user_id = auth.uid() and ul.league_id = league_id
    ))
    and (team_id is null or exists (
      select 1
      from public.user_team_selections uts
      join public.fantasy_teams ft on ft.id = uts.team_id
      where uts.user_id = auth.uid()
        and uts.team_id = team_id
        and (league_id is null or ft.league_id = league_id)
    ))
  );

create policy "users manage messages in own threads" on public.agent_messages
  for all to authenticated
  using (exists (
    select 1 from public.agent_threads thread
    where thread.id = thread_id and thread.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.agent_threads thread
    where thread.id = thread_id and thread.user_id = auth.uid()
  ));

create or replace function public.touch_agent_thread()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.agent_threads set updated_at = now() where id = new.thread_id;
  return new;
end;
$$;

create trigger agent_message_touches_thread
after insert on public.agent_messages
for each row execute function public.touch_agent_thread();

grant select, insert, update, delete on public.agent_threads, public.agent_messages to authenticated;
grant usage, select on sequence public.agent_messages_id_seq to authenticated;
