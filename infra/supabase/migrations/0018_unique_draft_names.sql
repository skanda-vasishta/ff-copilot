-- Give pre-existing duplicate runs stable distinct names before enforcing the
-- user-facing invariant for all future creates and renames.
with duplicate_names as (
  select id,
    row_number() over (
      partition by user_id, league_id, lower(btrim(name))
      order by created_at, id
    ) as duplicate_number
  from public.draft_sessions
)
update public.draft_sessions ds
set name = ds.name || ' · ' || left(ds.id::text, 8)
from duplicate_names duplicates
where duplicates.id = ds.id and duplicates.duplicate_number > 1;

create unique index draft_sessions_unique_name_per_league
  on public.draft_sessions(user_id, league_id, lower(btrim(name)));

alter table public.draft_sessions
  add constraint draft_session_name_not_blank check (length(btrim(name)) > 0);
