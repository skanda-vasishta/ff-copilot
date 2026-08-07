'use client'

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type SyncRun = {
  id: string; kind: string; provider: string; season: number; week: number | null; status: string;
  records_read: number; records_written: number; source_errors: unknown; started_at: string; finished_at: string | null
}
export type SyncRequest = { id: string; external_id: string; status: string; requested_at: string; error?: string | null }
type SourceFreshness = Record<string, { latest_fetched_at: string | null; player_count: number }>
type SyncStatus = {
  requests: SyncRequest[]
  runs: SyncRun[]
  latest_global_run: SyncRun | null
  freshness: { snapshots: SourceFreshness; rankings: SourceFreshness; documents: SourceFreshness }
}

function errors(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => typeof item === 'string' ? item : item && typeof item === 'object' ? String((item as Record<string, unknown>).error || (item as Record<string, unknown>).message || JSON.stringify(item)) : String(item))
}

export function useSyncStatus() {
  return useQuery({ queryKey: ['sync-status'], queryFn: () => api<SyncStatus>('/v1/sync-status'), refetchInterval: 60_000 })
}

export function SyncOverview({ compact = false }: { compact?: boolean }) {
  const sync = useSyncStatus()
  const latest = sync.data?.latest_global_run
  const failures = errors(latest?.source_errors)
  const sources = sync.data?.freshness
  if (sync.isLoading) return <div className="h-32 animate-pulse rounded-2xl border border-white/[.05] bg-white/[.025]" />
  if (!latest) return <div className="rounded-2xl border border-dashed border-white/[.1] p-5 text-sm text-[#78847e]">No sync has run yet.</div>

  const succeeded = latest.status === 'succeeded'
  const running = latest.status === 'running'
  return <div className={`panel rounded-2xl ${compact ? 'p-5' : 'p-6'}`}>
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#65716b]">Data pipeline</p><h3 className="mt-2 text-base font-semibold text-white">Latest global refresh</h3></div>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${succeeded ? 'bg-[#b7f34a]/10 text-[#c8f775]' : running ? 'bg-sky-300/10 text-sky-200' : 'bg-amber-300/10 text-amber-200'}`}><span className={`size-1.5 rounded-full ${succeeded ? 'bg-[#b7f34a]' : running ? 'animate-pulse bg-sky-300' : 'bg-amber-300'}`} />{latest.status}</span>
    </div>
    <div className="mt-5 grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-[#65716b]">Read</p><p className="mt-1 font-mono text-xl font-semibold text-white">{latest.records_read.toLocaleString()}</p></div>
      <div className="rounded-xl bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-[#65716b]">Written</p><p className="mt-1 font-mono text-xl font-semibold text-white">{latest.records_written.toLocaleString()}</p></div>
    </div>
    <div className="mt-4 flex items-center justify-between text-xs text-[#65716b]"><span>{latest.provider} · {latest.season}{latest.week ? ` W${latest.week}` : ''}</span><time dateTime={latest.finished_at || latest.started_at}>{new Date(latest.finished_at || latest.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></div>
    {sources && <div className="mt-4 border-t border-white/[.06] pt-4"><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#65716b]">Source coverage</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(sources.snapshots).map(([source, value]) => <span key={`snapshot-${source}`} className="rounded-lg bg-white/[.04] px-2.5 py-1.5 text-[10px] text-[#aab4af]">{source} snapshots · {value.player_count}</span>)}{Object.entries(sources.documents).map(([source, value]) => <span key={`document-${source}`} className="rounded-lg bg-white/[.04] px-2.5 py-1.5 text-[10px] text-[#aab4af]">{source} sources · {value.player_count}</span>)}</div></div>}
    {failures.length > 0 && <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/[.05] p-3"><p className="text-xs font-semibold text-amber-200">{failures.length} source {failures.length === 1 ? 'failure' : 'failures'}</p><ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/70">{failures.slice(0, compact ? 2 : 5).map((failure, index) => <li key={`${failure}-${index}`} className="truncate">• {failure}</li>)}</ul></div>}
  </div>
}
