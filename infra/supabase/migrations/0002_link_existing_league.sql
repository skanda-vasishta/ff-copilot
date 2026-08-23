create or replace function public.link_existing_league(
  p_provider text,
  p_external_id text,
  p_season integer
)
returns setof public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  matched public.leagues%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into matched
  from public.leagues
  where provider = p_provider and external_id = p_external_id and season = p_season
  limit 1;

  if not found then
    return;
  end if;

  insert into public.user_leagues(user_id, league_id)
  values (auth.uid(), matched.id)
  on conflict do nothing;

  return next matched;
end;
$$;

revoke all on function public.link_existing_league(text, text, integer) from public;
grant execute on function public.link_existing_league(text, text, integer) to authenticated;
