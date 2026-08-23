alter table public.agent_threads
  add column context_snapshot jsonb,
  add column context_date_utc date,
  add column context_refreshed_at timestamptz;

alter table public.agent_threads
  add constraint agent_context_snapshot_is_object
  check (context_snapshot is null or jsonb_typeof(context_snapshot) = 'object');
