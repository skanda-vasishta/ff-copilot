alter table public.agent_daily_usage
  add column if not exists input_tokens bigint not null default 0 check (input_tokens >= 0),
  add column if not exists output_tokens bigint not null default 0 check (output_tokens >= 0),
  add column if not exists total_tokens bigint not null default 0 check (total_tokens >= 0);

alter table public.agent_global_daily_usage
  add column if not exists input_tokens bigint not null default 0 check (input_tokens >= 0),
  add column if not exists output_tokens bigint not null default 0 check (output_tokens >= 0),
  add column if not exists total_tokens bigint not null default 0 check (total_tokens >= 0);

drop function if exists public.consume_agent_quota();

create or replace function public.consume_agent_quota()
returns table(user_remaining bigint, global_remaining bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  current_user_tokens bigint;
  current_global_tokens bigint;
  current_minute_count integer;
  current_minute_start timestamptz;
begin
  if caller is null then
    raise exception using errcode = 'P0001', message = 'agent_auth_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(caller::text || '-' || today::text, 0));

  select total_tokens, minute_requests, minute_window_start
    into current_user_tokens, current_minute_count, current_minute_start
  from public.agent_daily_usage
  where user_id = caller and usage_date = today;

  if current_minute_start > now() - interval '1 minute' and current_minute_count >= 10 then
    raise exception using errcode = 'P0001', message = 'agent_rate_limit';
  end if;
  if coalesce(current_user_tokens, 0) >= 100000 then
    raise exception using errcode = 'P0001', message = 'agent_user_daily_limit';
  end if;

  select total_tokens into current_global_tokens
  from public.agent_global_daily_usage where usage_date = today;
  if coalesce(current_global_tokens, 0) >= 500000 then
    raise exception using errcode = 'P0001', message = 'agent_global_daily_limit';
  end if;

  insert into public.agent_daily_usage(
    user_id, usage_date, model_requests, last_request_at, minute_window_start, minute_requests
  ) values (caller, today, 1, now(), now(), 1)
  on conflict (user_id, usage_date) do update
    set model_requests = agent_daily_usage.model_requests + 1,
        last_request_at = now(),
        minute_requests = case when agent_daily_usage.minute_window_start > now() - interval '1 minute'
          then agent_daily_usage.minute_requests + 1 else 1 end,
        minute_window_start = case when agent_daily_usage.minute_window_start > now() - interval '1 minute'
          then agent_daily_usage.minute_window_start else now() end;

  return query select 100000 - coalesce(current_user_tokens, 0), 500000 - coalesce(current_global_tokens, 0);
end;
$$;

revoke all on function public.consume_agent_quota() from public;
grant execute on function public.consume_agent_quota() to authenticated;
grant execute on function public.consume_agent_quota() to service_role;

create or replace function public.record_agent_usage(p_input_tokens bigint, p_output_tokens bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  used bigint := greatest(coalesce(p_input_tokens, 0), 0) + greatest(coalesce(p_output_tokens, 0), 0);
begin
  if caller is null then
    raise exception using errcode = 'P0001', message = 'agent_auth_required';
  end if;

  insert into public.agent_daily_usage(user_id, usage_date, input_tokens, output_tokens, total_tokens)
  values (caller, today, greatest(p_input_tokens, 0), greatest(p_output_tokens, 0), used)
  on conflict (user_id, usage_date) do update
    set input_tokens = agent_daily_usage.input_tokens + greatest(p_input_tokens, 0),
        output_tokens = agent_daily_usage.output_tokens + greatest(p_output_tokens, 0),
        total_tokens = agent_daily_usage.total_tokens + used;

  insert into public.agent_global_daily_usage(usage_date, model_requests, input_tokens, output_tokens, total_tokens)
  values (today, 1, greatest(p_input_tokens, 0), greatest(p_output_tokens, 0), used)
  on conflict (usage_date) do update
    set model_requests = agent_global_daily_usage.model_requests + 1,
        input_tokens = agent_global_daily_usage.input_tokens + greatest(p_input_tokens, 0),
        output_tokens = agent_global_daily_usage.output_tokens + greatest(p_output_tokens, 0),
        total_tokens = agent_global_daily_usage.total_tokens + used;
end;
$$;

revoke all on function public.record_agent_usage(bigint, bigint) from public;
grant execute on function public.record_agent_usage(bigint, bigint) to authenticated;
grant execute on function public.record_agent_usage(bigint, bigint) to service_role;
