create type public.draft_session_source as enum ('manual', 'espn_live');

alter table public.draft_sessions
  add column source public.draft_session_source not null default 'manual',
  add column external_league_id text,
  add column external_team_id text;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.draft_sessions'::regclass
      and pg_get_constraintdef(oid) ilike '%selected_team_id%any%team_order%'
  loop
    execute format('alter table public.draft_sessions drop constraint %I', constraint_name);
  end loop;
end $$;

create table public.draft_participants (
  id uuid primary key,
  draft_session_id uuid not null references public.draft_sessions(id) on delete cascade,
  external_team_id text not null,
  name text not null,
  abbreviation text,
  draft_position integer not null check (draft_position > 0),
  is_user boolean not null default false,
  unique (draft_session_id, external_team_id),
  unique (draft_session_id, draft_position)
);

alter table public.draft_picks
  alter column fantasy_team_id drop not null,
  add column draft_participant_id uuid references public.draft_participants(id) on delete restrict,
  add constraint draft_pick_has_one_team check (
    (fantasy_team_id is not null and draft_participant_id is null)
    or (fantasy_team_id is null and draft_participant_id is not null)
  );

create index draft_participants_session_position_idx
  on public.draft_participants(draft_session_id, draft_position);

alter table public.draft_participants enable row level security;
create policy "users manage participants in own drafts" on public.draft_participants
  for all to authenticated
  using (exists (
    select 1 from public.draft_sessions ds
    where ds.id = draft_session_id and ds.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.draft_sessions ds
    where ds.id = draft_session_id and ds.user_id = auth.uid()
  ));

create or replace function public.record_draft_pick(p_session_id uuid, p_player_id uuid, p_overall_pick integer, p_expected_revision integer)
returns public.draft_sessions
language plpgsql security invoker set search_path = public as $$
declare
  session_row public.draft_sessions;
  team_id uuid;
  next_pick integer;
  total_picks integer;
begin
  select * into session_row from public.draft_sessions
    where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'draft_not_found'; end if;
  if session_row.revision <> p_expected_revision then raise exception 'draft_revision_conflict'; end if;
  total_picks := cardinality(session_row.team_order) * session_row.round_count;
  if p_overall_pick < 1 or p_overall_pick > total_picks then raise exception 'invalid_draft_pick'; end if;
  team_id := public.draft_team_for_pick(session_row.team_order, session_row.draft_type, p_overall_pick);
  if session_row.source = 'espn_live' then
    insert into public.draft_picks(draft_session_id, overall_pick, round_number, round_pick, draft_participant_id, player_id)
      values (session_row.id, p_overall_pick, ((p_overall_pick - 1) / cardinality(session_row.team_order)) + 1,
        ((p_overall_pick - 1) % cardinality(session_row.team_order)) + 1, team_id, p_player_id);
  else
    insert into public.draft_picks(draft_session_id, overall_pick, round_number, round_pick, fantasy_team_id, player_id)
      values (session_row.id, p_overall_pick, ((p_overall_pick - 1) / cardinality(session_row.team_order)) + 1,
        ((p_overall_pick - 1) % cardinality(session_row.team_order)) + 1, team_id, p_player_id);
  end if;
  select coalesce(min(slot), total_picks + 1) into next_pick
    from generate_series(1, total_picks) slot
    where not exists (select 1 from public.draft_picks dp where dp.draft_session_id = session_row.id and dp.overall_pick = slot);
  update public.draft_sessions set current_overall_pick = next_pick, revision = revision + 1,
    status = case when next_pick > total_picks then 'completed'::public.draft_session_status else 'active'::public.draft_session_status end,
    completed_at = case when next_pick > total_picks then now() else null end, updated_at = now()
    where id = session_row.id returning * into session_row;
  return session_row;
end;
$$;

grant select, insert, update, delete on public.draft_participants to authenticated;
grant all privileges on public.draft_participants to service_role;
