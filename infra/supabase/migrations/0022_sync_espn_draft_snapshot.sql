create or replace function public.sync_espn_draft_snapshot(p_session_id uuid, p_picks jsonb)
returns public.draft_sessions
language plpgsql security invoker set search_path = public as $$
declare
  session_row public.draft_sessions;
  pick_row jsonb;
  overall_no integer;
  player_uuid uuid;
  participant_uuid uuid;
  next_pick integer;
  total_picks integer;
begin
  select * into session_row from public.draft_sessions
    where id = p_session_id and user_id = auth.uid() for update;
  if not found then raise exception 'draft_not_found'; end if;
  if session_row.source <> 'espn_live' then raise exception 'not_espn_live_draft'; end if;
  if jsonb_typeof(p_picks) <> 'array' then raise exception 'invalid_draft_snapshot'; end if;

  total_picks := cardinality(session_row.team_order) * session_row.round_count;
  delete from public.draft_picks where draft_session_id = session_row.id;

  for pick_row in select value from jsonb_array_elements(p_picks)
  loop
    overall_no := (pick_row->>'overall_pick')::integer;
    player_uuid := (pick_row->>'player_id')::uuid;
    if overall_no < 1 or overall_no > total_picks then raise exception 'invalid_draft_pick'; end if;
    participant_uuid := public.draft_team_for_pick(session_row.team_order, session_row.draft_type, overall_no);
    insert into public.draft_picks(
      draft_session_id, overall_pick, round_number, round_pick,
      draft_participant_id, player_id
    ) values (
      session_row.id, overall_no,
      ((overall_no - 1) / cardinality(session_row.team_order)) + 1,
      ((overall_no - 1) % cardinality(session_row.team_order)) + 1,
      participant_uuid, player_uuid
    );
  end loop;

  select coalesce(min(slot), total_picks + 1) into next_pick
    from generate_series(1, total_picks) slot
    where not exists (
      select 1 from public.draft_picks dp
      where dp.draft_session_id = session_row.id and dp.overall_pick = slot
    );
  update public.draft_sessions set
    current_overall_pick = next_pick,
    revision = revision + 1,
    status = case when next_pick > total_picks then 'completed'::public.draft_session_status else 'active'::public.draft_session_status end,
    completed_at = case when next_pick > total_picks then now() else null end,
    updated_at = now()
  where id = session_row.id returning * into session_row;
  return session_row;
end;
$$;

grant execute on function public.sync_espn_draft_snapshot(uuid,jsonb) to authenticated;
