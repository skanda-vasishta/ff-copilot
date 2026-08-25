create type public.draft_session_status as enum ('setup', 'active', 'completed');
create type public.draft_order_type as enum ('snake', 'linear');

create table public.draft_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  selected_team_id uuid not null references public.fantasy_teams(id) on delete restrict,
  season integer not null,
  name text not null default 'Draft',
  status public.draft_session_status not null default 'setup',
  draft_type public.draft_order_type not null default 'snake',
  team_order uuid[] not null,
  round_count integer not null check (round_count between 1 and 40),
  current_overall_pick integer not null default 1 check (current_overall_pick > 0),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (cardinality(team_order) between 2 and 32),
  check (selected_team_id = any(team_order))
);

create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  draft_session_id uuid not null references public.draft_sessions(id) on delete cascade,
  overall_pick integer not null check (overall_pick > 0),
  round_number integer not null check (round_number > 0),
  round_pick integer not null check (round_pick > 0),
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  selected_at timestamptz not null default now(),
  unique (draft_session_id, overall_pick),
  unique (draft_session_id, player_id)
);

create index draft_sessions_user_updated_idx on public.draft_sessions(user_id, updated_at desc);
create index draft_picks_session_order_idx on public.draft_picks(draft_session_id, overall_pick);

alter table public.agent_threads add column draft_session_id uuid references public.draft_sessions(id) on delete cascade;
create unique index one_agent_thread_per_draft on public.agent_threads(draft_session_id) where draft_session_id is not null;

alter table public.draft_sessions enable row level security;
alter table public.draft_picks enable row level security;

create policy "users manage own draft sessions" on public.draft_sessions for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.user_leagues ul where ul.user_id = auth.uid() and ul.league_id = league_id)
    and exists (select 1 from public.user_team_selections uts where uts.user_id = auth.uid() and uts.team_id = selected_team_id)
  );

create policy "users manage picks in own drafts" on public.draft_picks for all to authenticated
  using (exists (select 1 from public.draft_sessions ds where ds.id = draft_session_id and ds.user_id = auth.uid()))
  with check (exists (select 1 from public.draft_sessions ds where ds.id = draft_session_id and ds.user_id = auth.uid()));

create or replace function public.draft_team_for_pick(p_order uuid[], p_type public.draft_order_type, p_overall integer)
returns uuid language sql immutable strict as $$
  select case
    when p_type = 'snake' and ((p_overall - 1) / cardinality(p_order)) % 2 = 1
      then p_order[cardinality(p_order) - ((p_overall - 1) % cardinality(p_order))]
    else p_order[((p_overall - 1) % cardinality(p_order)) + 1]
  end
$$;

create or replace function public.record_draft_pick(p_session_id uuid, p_player_id uuid, p_overall_pick integer, p_expected_revision integer)
returns public.draft_sessions
language plpgsql security invoker set search_path = public as $$
declare
  session_row public.draft_sessions;
  team_id uuid;
  next_pick integer;
  total_picks integer;
  player_name text;
  team_name text;
begin
  select * into session_row from public.draft_sessions where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'draft_not_found'; end if;
  if session_row.revision <> p_expected_revision then raise exception 'draft_revision_conflict'; end if;
  total_picks := cardinality(session_row.team_order) * session_row.round_count;
  if p_overall_pick < 1 or p_overall_pick > total_picks then raise exception 'invalid_draft_pick'; end if;
  team_id := public.draft_team_for_pick(session_row.team_order, session_row.draft_type, p_overall_pick);
  insert into public.draft_picks(draft_session_id, overall_pick, round_number, round_pick, fantasy_team_id, player_id)
    values (session_row.id, p_overall_pick, ((p_overall_pick - 1) / cardinality(session_row.team_order)) + 1,
      ((p_overall_pick - 1) % cardinality(session_row.team_order)) + 1, team_id, p_player_id);
  select coalesce(min(slot), total_picks + 1) into next_pick
    from generate_series(1, total_picks) slot
    where not exists (select 1 from public.draft_picks dp where dp.draft_session_id = session_row.id and dp.overall_pick = slot);
  update public.draft_sessions set current_overall_pick = next_pick, revision = revision + 1,
    status = case when next_pick > total_picks then 'completed'::public.draft_session_status else 'active'::public.draft_session_status end,
    completed_at = case when next_pick > total_picks then now() else null end, updated_at = now()
    where id = session_row.id returning * into session_row;
  select name into player_name from public.players where id = p_player_id;
  select name into team_name from public.fantasy_teams where id = team_id;
  insert into public.agent_messages(thread_id, role, parts)
    select id, 'user', jsonb_build_array(jsonb_build_object('type','text','text',
      format('[Draft event] Pick %s: %s selected %s.', p_overall_pick, team_name, player_name)))
    from public.agent_threads where draft_session_id = session_row.id;
  return session_row;
end;
$$;

create or replace function public.remove_draft_pick(p_session_id uuid, p_overall_pick integer, p_expected_revision integer)
returns public.draft_sessions
language plpgsql security invoker set search_path = public as $$
declare session_row public.draft_sessions; removed_player text; total_picks integer;
begin
  select * into session_row from public.draft_sessions where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'draft_not_found'; end if;
  if session_row.revision <> p_expected_revision then raise exception 'draft_revision_conflict'; end if;
  select p.name into removed_player from public.draft_picks dp join public.players p on p.id = dp.player_id
    where dp.draft_session_id = session_row.id and dp.overall_pick = p_overall_pick;
  if removed_player is null then raise exception 'draft_pick_not_found'; end if;
  delete from public.draft_picks where draft_session_id = session_row.id and overall_pick = p_overall_pick;
  total_picks := cardinality(session_row.team_order) * session_row.round_count;
  update public.draft_sessions set current_overall_pick = least(current_overall_pick, p_overall_pick), revision = revision + 1,
    status = 'active', completed_at = null, updated_at = now() where id = session_row.id returning * into session_row;
  insert into public.agent_messages(thread_id, role, parts)
    select id, 'user', jsonb_build_array(jsonb_build_object('type','text','text',
      format('[Draft correction] Pick %s (%s) was removed.', p_overall_pick, removed_player)))
    from public.agent_threads where draft_session_id = session_row.id;
  return session_row;
end;
$$;

grant select, insert, update, delete on public.draft_sessions, public.draft_picks to authenticated;
grant execute on function public.record_draft_pick(uuid,uuid,integer,integer) to authenticated;
grant execute on function public.remove_draft_pick(uuid,integer,integer) to authenticated;
grant all privileges on public.draft_sessions, public.draft_picks to service_role;
