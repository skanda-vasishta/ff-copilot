alter table public.league_transactions
  add column activity_at timestamptz generated always as (
    coalesce(processed_at, proposed_at, fetched_at)
  ) stored;

create index league_transactions_activity_idx
  on public.league_transactions(league_id, activity_at desc);
