create or replace function public.lock_agent_thread_team()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.team_id is distinct from new.team_id
    or old.league_id is distinct from new.league_id then
    raise exception 'A conversation team and league cannot be changed';
  end if;
  return new;
end;
$$;

create trigger agent_thread_team_is_immutable
before update of team_id, league_id on public.agent_threads
for each row execute function public.lock_agent_thread_team();
