create or replace function public.normalized_player_identity(player_name text, player_position text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(coalesce(player_name, ''), '[^a-zA-Z0-9]', '', 'g'))
    || ':' || upper(coalesce(player_position, ''))
$$;

-- Only merge identities that have at most one ID from each authoritative
-- provider. This repairs ingestion-created copies without collapsing two real
-- players who happen to share a name and position.
create temporary table player_merge_map on commit drop as
with identities as (
  select p.id, p.created_at,
    public.normalized_player_identity(p.name, p.position) identity_key,
    exists (select 1 from public.player_external_ids e where e.player_id = p.id and e.provider = 'espn') has_espn,
    exists (select 1 from public.player_external_ids e where e.player_id = p.id and e.provider = 'sleeper') has_sleeper,
    exists (select 1 from public.player_external_ids e where e.player_id = p.id) has_external_id
  from public.players p
  where p.position in ('QB', 'RB', 'WR', 'TE')
), eligible as (
  select i.identity_key
  from identities i
  left join public.player_external_ids e on e.player_id = i.id
  group by i.identity_key
  having count(*) > 1
    and count(distinct e.external_id) filter (where e.provider = 'espn') <= 1
    and count(distinct e.external_id) filter (where e.provider = 'sleeper') <= 1
    and count(distinct e.external_id) filter (where e.provider = 'fantasypros') <= 1
    and count(distinct e.external_id) filter (where e.provider = 'fftoday') <= 1
), ranked as (
  select i.id,
    first_value(i.id) over (
      partition by i.identity_key
      order by i.has_espn desc, i.has_sleeper desc, i.has_external_id desc, i.created_at, i.id
    ) canonical_id
  from identities i join eligible e using (identity_key)
)
select id duplicate_id, canonical_id from ranked where id <> canonical_id;

delete from public.player_external_ids duplicate
using player_merge_map mapping
where duplicate.player_id = mapping.duplicate_id
  and exists (
    select 1 from public.player_external_ids canonical
    where canonical.player_id = mapping.canonical_id and canonical.provider = duplicate.provider
  );
update public.player_external_ids target set player_id = mapping.canonical_id
from player_merge_map mapping where target.player_id = mapping.duplicate_id;

with duplicates as (
  select id from (
    select snapshot.id,
      row_number() over (partition by coalesce(mapping.canonical_id, snapshot.player_id), snapshot.source,
        snapshot.season, snapshot.week, snapshot.data_hash order by snapshot.fetched_at desc, snapshot.id) ordinal
    from public.player_snapshots snapshot
    left join player_merge_map mapping on mapping.duplicate_id = snapshot.player_id
  ) ranked where ordinal > 1
)
delete from public.player_snapshots target using duplicates where target.id = duplicates.id;
update public.player_snapshots target set player_id = mapping.canonical_id
from player_merge_map mapping where target.player_id = mapping.duplicate_id;

with duplicates as (
  select id from (
    select ranking.id,
      row_number() over (partition by coalesce(mapping.canonical_id, ranking.player_id), ranking.source,
        ranking.season, ranking.week, ranking.scoring_format, ranking.ranking_type,
        ranking.overall_rank, ranking.position_rank order by ranking.fetched_at desc, ranking.id) ordinal
    from public.player_rankings ranking
    left join player_merge_map mapping on mapping.duplicate_id = ranking.player_id
  ) ranked where ordinal > 1
)
delete from public.player_rankings target using duplicates where target.id = duplicates.id;
update public.player_rankings target set player_id = mapping.canonical_id
from player_merge_map mapping where target.player_id = mapping.duplicate_id;

with duplicates as (
  select id from (
    select document.id,
      row_number() over (partition by coalesce(mapping.canonical_id, document.player_id), document.source,
        document.content_hash order by document.fetched_at desc, document.id) ordinal
    from public.source_documents document
    left join player_merge_map mapping on mapping.duplicate_id = document.player_id
  ) ranked where ordinal > 1
)
delete from public.source_documents target using duplicates where target.id = duplicates.id;
update public.source_documents target set player_id = mapping.canonical_id
from player_merge_map mapping where target.player_id = mapping.duplicate_id;

with duplicates as (
  select row_ref from (
    select roster.ctid row_ref,
      row_number() over (partition by roster.roster_snapshot_id,
        coalesce(mapping.canonical_id, roster.player_id) order by roster.ctid) ordinal
    from public.roster_players roster
    left join player_merge_map mapping on mapping.duplicate_id = roster.player_id
  ) ranked where ordinal > 1
)
delete from public.roster_players target using duplicates where target.ctid = duplicates.row_ref;
update public.roster_players target set player_id = mapping.canonical_id
from player_merge_map mapping where target.player_id = mapping.duplicate_id;

update public.league_draft_picks target set player_id = mapping.canonical_id
from player_merge_map mapping where target.player_id = mapping.duplicate_id;

with duplicates as (
  select id from (
    select pick.id,
      row_number() over (partition by pick.draft_session_id,
        coalesce(mapping.canonical_id, pick.player_id) order by pick.selected_at, pick.id) ordinal
    from public.draft_picks pick
    left join player_merge_map mapping on mapping.duplicate_id = pick.player_id
  ) ranked where ordinal > 1
)
delete from public.draft_picks target using duplicates where target.id = duplicates.id;
update public.draft_picks target set player_id = mapping.canonical_id
from player_merge_map mapping where target.player_id = mapping.duplicate_id;

delete from public.players target using player_merge_map mapping where target.id = mapping.duplicate_id;

alter table public.players
  add column identity_key text generated always as (public.normalized_player_identity(name, position)) stored,
  add column identity_locked boolean not null default true;

-- Preserve legitimate same-name collisions, if any, while preventing ingestion
-- from manufacturing another copy of every unlinked provider player.
update public.players p set identity_locked = false
where exists (
  select 1 from public.players other
  where other.id <> p.id
    and public.normalized_player_identity(other.name, other.position) = p.identity_key
);
create unique index players_canonical_identity_idx on public.players(identity_key) where identity_locked;
create index players_identity_lookup_idx on public.players(identity_key);

refresh materialized view public.player_directory_cache;
