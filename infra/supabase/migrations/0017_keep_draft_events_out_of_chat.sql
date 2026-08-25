-- Draft picks are authoritative state, not conversation turns. The draft
-- context builder reads this state at the beginning of every agent run.
create or replace function public.record_draft_pick(p_session_id uuid, p_player_id uuid, p_overall_pick integer, p_expected_revision integer)
returns public.draft_sessions
language plpgsql security invoker set search_path = public as $$
declare
  session_row public.draft_sessions;
  team_id uuid;
  next_pick integer;
  total_picks integer;
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
  return session_row;
end;
$$;

create or replace function public.remove_draft_pick(p_session_id uuid, p_overall_pick integer, p_expected_revision integer)
returns public.draft_sessions
language plpgsql security invoker set search_path = public as $$
declare session_row public.draft_sessions; total_picks integer;
begin
  select * into session_row from public.draft_sessions where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'draft_not_found'; end if;
  if session_row.revision <> p_expected_revision then raise exception 'draft_revision_conflict'; end if;
  if not exists (select 1 from public.draft_picks where draft_session_id = session_row.id and overall_pick = p_overall_pick)
    then raise exception 'draft_pick_not_found'; end if;
  delete from public.draft_picks where draft_session_id = session_row.id and overall_pick = p_overall_pick;
  total_picks := cardinality(session_row.team_order) * session_row.round_count;
  update public.draft_sessions set current_overall_pick = least(current_overall_pick, p_overall_pick), revision = revision + 1,
    status = 'active', completed_at = null, updated_at = now() where id = session_row.id returning * into session_row;
  return session_row;
end;
$$;
