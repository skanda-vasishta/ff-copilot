create table public.league_transactions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  provider_transaction_id text not null,
  transaction_type text not null,
  status text not null,
  initiated_by_team_id uuid references public.fantasy_teams(id) on delete set null,
  initiated_by_team_external_id text,
  proposed_at timestamptz,
  processed_at timestamptz,
  expires_at timestamptz,
  bid_amount numeric,
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (league_id, provider_transaction_id)
);

create index league_transactions_feed_idx
  on public.league_transactions(league_id, processed_at desc nulls last, proposed_at desc nulls last);

create table public.league_transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.league_transactions(id) on delete cascade,
  item_index integer not null,
  item_type text not null,
  player_id uuid references public.players(id) on delete set null,
  player_external_id text,
  player_name text,
  from_team_id uuid references public.fantasy_teams(id) on delete set null,
  from_team_external_id text,
  to_team_id uuid references public.fantasy_teams(id) on delete set null,
  to_team_external_id text,
  raw_payload jsonb not null default '{}'::jsonb,
  unique (transaction_id, item_index)
);

create index league_transaction_items_transaction_idx on public.league_transaction_items(transaction_id);

alter table public.league_transactions enable row level security;
alter table public.league_transaction_items enable row level security;

create policy "users read linked league transactions" on public.league_transactions
  for select to authenticated using (
    exists (
      select 1 from public.user_leagues ul
      where ul.league_id = league_id and ul.user_id = auth.uid()
    )
  );

create policy "users read linked league transaction items" on public.league_transaction_items
  for select to authenticated using (
    exists (
      select 1
      from public.league_transactions lt
      join public.user_leagues ul on ul.league_id = lt.league_id
      where lt.id = transaction_id and ul.user_id = auth.uid()
    )
  );

grant select on public.league_transactions, public.league_transaction_items to authenticated;
grant all privileges on public.league_transactions, public.league_transaction_items to service_role;
