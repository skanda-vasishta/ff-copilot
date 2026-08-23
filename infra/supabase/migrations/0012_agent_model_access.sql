alter table public.agent_threads
  add column if not exists model_id text;

create or replace function public.has_agent_model_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.agent_unlimited_users where user_id = auth.uid()
  );
$$;

revoke all on function public.has_agent_model_access() from public;
grant execute on function public.has_agent_model_access() to authenticated;
grant execute on function public.has_agent_model_access() to service_role;
