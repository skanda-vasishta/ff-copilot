'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

type PlayerRecord = { id: string; name: string; position: string | null; nfl_team: string | null; active: boolean }
type Snapshot = {
  id: string; season: number; week: number | null; source: string; position_rank: number | null;
  injury_status: string | null; total_points: number | null; average_points: number | null;
  projected_total_points: number | null; projected_average_points: number | null;
  percent_owned: number | null; percent_started: number | null; fetched_at: string
}
type Ranking = { id: string; source: string; scoring_format: string; ranking_type: string; overall_rank: number | null; position_rank: number | null; fetched_at: string }
type RankingResponse = { items: Ranking[]; summary: { average: number | null; median: number | null; minimum: number | null; maximum: number | null; source_count: number } }
type SourceDocument = { id: string; source: string; title: string | null; content: string; source_url: string | null; published_at: string | null; fetched_at: string }

const sourceNames: Record<string, string> = { espn: 'ESPN', fantasypros: 'FantasyPros', reddit: 'Reddit' }

function number(value: number | null | undefined, digits = 1) { return value == null ? '—' : value.toFixed(digits) }
function date(value: string | null) { return value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown' }

export function PlayerProfile({ playerId }: { playerId: string }) {
  const player = useQuery({ queryKey: ['player', playerId], queryFn: () => api<PlayerRecord>(`/v1/players/${playerId}`) })
  const snapshots = useQuery({ queryKey: ['player-snapshots', playerId], queryFn: () => api<Snapshot[]>(`/v1/players/${playerId}/snapshots?season=2026`) })
  const rankings = useQuery({ queryKey: ['player-rankings', playerId], queryFn: () => api<RankingResponse>(`/v1/players/${playerId}/rankings?season=2026`) })
  const sources = useQuery({ queryKey: ['player-sources', playerId], queryFn: () => api<SourceDocument[]>(`/v1/players/${playerId}/sources`) })
  const latest = snapshots.data?.[0]
  const isLoading = player.isLoading || snapshots.isLoading || rankings.isLoading || sources.isLoading
  const error = player.error || snapshots.error || rankings.error || sources.error

  if (isLoading) return <div className="mt-6 space-y-4"><div className="h-44 animate-pulse rounded-3xl bg-white/[.03]" /><div className="h-72 animate-pulse rounded-2xl bg-white/[.03]" /></div>
  if (error || !player.data) return <div role="alert" className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/[.06] p-6 text-sm text-red-200">We couldn&apos;t load this player. {error?.message}</div>

  const bySource = (sources.data || []).reduce<Record<string, SourceDocument[]>>((groups, document) => {
    (groups[document.source] ||= []).push(document)
    return groups
  }, {})

  return <div className="mt-6 space-y-5">
    <header className="panel relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[#b7f34a]/[.06] blur-3xl" />
      <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#b7f34a]"><span>{player.data.position || 'NFL'}</span><span className="text-[#4f5a54]">·</span><span>{player.data.nfl_team || 'Free agent'}</span></div><h1 className="mt-3 text-4xl font-semibold tracking-[-.045em] text-white sm:text-5xl">{player.data.name}</h1><p className="mt-3 text-sm text-[#78847e]">Cross-source player file · 2026 season</p></div>
        <div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-black/20 px-3 py-2 text-xs text-[#9da7a2]"><span className={`size-2 rounded-full ${latest?.injury_status ? 'bg-amber-300' : 'bg-[#b7f34a]'}`} />{latest?.injury_status || 'No injury designation'}</div>
      </div>
    </header>

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[['Projected points', number(latest?.projected_total_points)], ['Projected / game', number(latest?.projected_average_points)], ['Position rank', latest?.position_rank == null ? '—' : `#${latest.position_rank}`], ['Rostered', latest?.percent_owned == null ? '—' : `${number(latest.percent_owned)}%`]].map(([label, value]) => <div key={label} className="panel rounded-2xl p-5"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#65716b]">{label}</p><p className="mt-2 font-mono text-2xl font-semibold text-white">{value}</p><p className="mt-2 text-[10px] text-[#58635d]">ESPN · {date(latest?.fetched_at || null)}</p></div>)}
    </section>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="panel overflow-hidden rounded-2xl">
        <div className="border-b border-white/[.07] px-5 py-5 sm:px-6"><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#b7f34a]">Source intelligence</p><h2 className="mt-2 text-xl font-semibold text-white">What every source is saying</h2><p className="mt-2 text-sm text-[#78847e]">Raw source material is kept separate and labeled. Expand an item to read more.</p></div>
        <div className="divide-y divide-white/[.06]">{Object.entries(bySource).map(([source, documents]) => <div key={source} className="p-5 sm:p-6"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-white">{sourceNames[source] || source}</h3><span className="rounded-full bg-white/[.05] px-2.5 py-1 text-[10px] text-[#78847e]">{documents.length} {documents.length === 1 ? 'item' : 'items'}</span></div><div className="space-y-3">{documents.slice(0, 5).map(document => <details key={document.id} className="group rounded-xl border border-white/[.07] bg-black/15 p-4"><summary className="cursor-pointer list-none text-sm font-medium text-[#c6ceca]"><span className="flex items-start justify-between gap-4"><span>{document.title || document.content.slice(0, 120).replace(/\s+/g, ' ')}</span><span className="text-[#65716b] transition group-open:rotate-90">→</span></span><span className="mt-2 block text-[10px] font-normal text-[#58635d]">Published {date(document.published_at)} · fetched {date(document.fetched_at)}</span></summary><p className="mt-4 whitespace-pre-wrap border-t border-white/[.06] pt-4 text-sm leading-6 text-[#9da7a2]">{document.content}</p>{document.source_url && <a href={document.source_url} target="_blank" rel="noreferrer" className="focus-ring mt-4 inline-flex rounded text-xs font-medium text-[#b7f34a] hover:underline">Open original ↗</a>}</details>)}</div></div>)}{!sources.data?.length && <div className="px-6 py-14 text-center text-sm text-[#78847e]">No source documents have been collected for this player yet.</div>}</div>
      </section>

      <aside className="space-y-5">
        <section className="panel rounded-2xl p-5"><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#65716b]">Ranking summary</p><div className="mt-4 grid grid-cols-2 gap-3">{[['Average', number(rankings.data?.summary.average)], ['Median', number(rankings.data?.summary.median)], ['Best', number(rankings.data?.summary.minimum, 0)], ['Worst', number(rankings.data?.summary.maximum, 0)]].map(([label, value]) => <div key={label} className="rounded-xl bg-black/20 p-3"><p className="text-[10px] text-[#65716b]">{label}</p><p className="mt-1 font-mono text-lg font-semibold text-white">{value}</p></div>)}</div><p className="mt-3 text-[10px] text-[#58635d]">{rankings.data?.summary.source_count || 0} source rankings with an overall rank</p></section>
        <section className="panel rounded-2xl p-5"><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#65716b]">2026 facts</p><dl className="mt-4 space-y-3 text-sm">{[['Actual points', number(latest?.total_points)], ['Average / game', number(latest?.average_points)], ['Started', latest?.percent_started == null ? '—' : `${number(latest.percent_started)}%`], ['Last refreshed', date(latest?.fetched_at || null)]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3"><dt className="text-[#78847e]">{label}</dt><dd className="font-mono text-[#c6ceca]">{value}</dd></div>)}</dl></section>
      </aside>
    </div>
  </div>
}
