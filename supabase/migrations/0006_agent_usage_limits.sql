create table public.agent_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (now() at time zone 'utc')::date,
  model_requests integer not null default 0 check (model_requests >= 0),
  last_request_at timestamptz,
  minute_window_start timestamptz not null default now(),
  minute_requests integer not null default 0 check (minute_requests >= 0),
  primary key (user_id, usage_date)
);

create table public.agent_global_daily_usage (
  usage_date date primary key default (now() at time zone 'utc')::date,
  model_requests integer not null default 0 check (model_requests >= 0)
);

alter table public.agent_daily_usage enable row level security;
alter table public.agent_global_daily_usage enable row level security;

create policy "users read own agent usage" on public.agent_daily_usage
  for select to authenticated using (user_id = auth.uid());

grant select on public.agent_daily_usage to authenticated;
grant all privileges on public.agent_daily_usage, public.agent_global_daily_usage to service_role;

create or replace function public.consume_agent_quota()
returns table(user_remaining integer, global_remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  current_user_count integer;
  current_global_count integer;
  current_minute_count integer;
  current_minute_start timestamptz;
begin
  if caller is null then
    raise exception using errcode = 'P0001', message = 'agent_auth_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('agent-global-' || today::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(caller::text || '-' || today::text, 0));

  select model_requests, minute_requests, minute_window_start
    into current_user_count, current_minute_count, current_minute_start
  from public.agent_daily_usage
  where user_id = caller and usage_date = today;

  if current_minute_start > now() - interval '1 minute' and current_minute_count >= 10 then
    raise exception using errcode = 'P0001', message = 'agent_rate_limit';
  end if;
  if coalesce(current_user_count, 0) >= 40 then
    raise exception using errcode = 'P0001', message = 'agent_user_daily_limit';
  end if;

  select model_requests into current_global_count
  from public.agent_global_daily_usage where usage_date = today;
  if coalesce(current_global_count, 0) >= 500 then
    raise exception using errcode = 'P0001', message = 'agent_global_daily_limit';
  end if;

  insert into public.agent_daily_usage(
    user_id, usage_date, model_requests, last_request_at, minute_window_start, minute_requests
  ) values (caller, today, 1, now(), now(), 1)
  on conflict (user_id, usage_date) do update
    set model_requests = agent_daily_usage.model_requests + 1,
        last_request_at = now(),
        minute_requests = case
          when agent_daily_usage.minute_window_start > now() - interval '1 minute'
            then agent_daily_usage.minute_requests + 1
          else 1
        end,
        minute_window_start = case
          when agent_daily_usage.minute_window_start > now() - interval '1 minute'
            then agent_daily_usage.minute_window_start
          else now()
        end
  returning model_requests into current_user_count;

  insert into public.agent_global_daily_usage(usage_date, model_requests)
  values (today, 1)
  on conflict (usage_date) do update
    set model_requests = agent_global_daily_usage.model_requests + 1
  returning model_requests into current_global_count;

  return query select 40 - current_user_count, 500 - current_global_count;
end;
$$;

revoke all on function public.consume_agent_quota() from public;
grant execute on function public.consume_agent_quota() to authenticated;
grant execute on function public.consume_agent_quota() to service_role;
