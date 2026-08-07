'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, Player, Paginated, queryString } from '@/lib/api'

const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST']
const positionTone: Record<string, string> = { QB: 'bg-violet-400/10 text-violet-300', RB: 'bg-sky-400/10 text-sky-300', WR: 'bg-amber-300/10 text-amber-200', TE: 'bg-rose-400/10 text-rose-300', K: 'bg-white/[.06] text-[#bbc4bf]', 'D/ST': 'bg-emerald-400/10 text-emerald-300' }

export function PlayerDirectory() {
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<'name' | 'projected_total_points' | 'average_rank'>('name')
  const query = queryString({ search, position, season: 2026, page, page_size: 25, sort, direction: sort === 'name' ? 'asc' : 'desc' })
  const players = useQuery({ queryKey: ['players', query], queryFn: () => api<Paginated<Player>>(`/v1/players?${query}`) })
  const totalPages = Math.max(1, Math.ceil((players.data?.total || 0) / 25))

  return <div>
    <div className="panel rounded-2xl p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Search players</span><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#65716b]">⌕</span><input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search by player name…" className="focus-ring w-full rounded-xl border border-white/[.08] bg-[#090d10] py-3 pl-11 pr-4 text-sm text-white placeholder:text-[#58635d] focus:border-[#b7f34a]/40" /></label>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0" aria-label="Filter by position">
          <button onClick={() => { setPosition(''); setPage(1) }} className={`focus-ring shrink-0 rounded-lg px-3 py-2.5 text-xs font-semibold transition ${!position ? 'bg-[#b7f34a] text-[#10140a]' : 'bg-white/[.05] text-[#8c9992] hover:text-white'}`}>All</button>
          {positions.map(p => <button key={p} onClick={() => { setPosition(p); setPage(1) }} className={`focus-ring shrink-0 rounded-lg px-3 py-2.5 text-xs font-semibold transition ${position === p ? 'bg-[#b7f34a] text-[#10140a]' : 'bg-white/[.05] text-[#8c9992] hover:text-white'}`}>{p}</button>)}
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-white/[.08] bg-[#090d10] px-3"><span className="whitespace-nowrap text-xs text-[#65716b]">Sort by</span><select aria-label="Sort players" value={sort} onChange={e => { setSort(e.target.value as typeof sort); setPage(1) }} className="focus-ring min-w-32 bg-transparent py-3 text-sm text-white outline-none"><option value="name">Name</option><option value="projected_total_points">Projected points</option><option value="average_rank">Average rank</option></select></label>
      </div>
    </div>

    {players.isLoading && <div className="mt-5 grid gap-2" aria-label="Loading players">{Array.from({length: 7}).map((_, i) => <div key={i} className="h-[68px] animate-pulse rounded-xl border border-white/[.04] bg-white/[.025]" />)}</div>}
    {players.error && <p role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/[.06] p-4 text-sm text-red-200">We couldn&apos;t load players. {players.error.message}</p>}
    {players.data && <div className="panel mt-5 overflow-hidden rounded-2xl">
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
        <thead><tr className="border-b border-white/[.07] bg-black/10 text-[10px] font-semibold uppercase tracking-[.14em] text-[#65716b]"><th className="px-5 py-4 sm:px-6">Player</th><th className="px-3 py-4">Pos</th><th className="px-3 py-4">Team</th><th className="px-3 py-4 text-right">Projection</th><th className="px-3 py-4 text-right">Median rank</th><th className="px-3 py-4">Availability</th><th className="px-5 py-4 text-right sm:px-6">Updated</th></tr></thead>
        <tbody className="divide-y divide-white/[.055]">{players.data.items.map(player => <tr key={player.id} className="group transition hover:bg-white/[.025]">
          <td className="px-5 py-4 sm:px-6"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-white/[.055] text-xs font-semibold text-[#b8c1bc]">{player.name.split(' ').map(part => part[0]).slice(0,2).join('')}</span><span className="font-medium text-white">{player.name}</span></div></td>
          <td className="px-3 py-4"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${positionTone[player.position || ''] || 'bg-white/[.05] text-[#9da7a2]'}`}>{player.position || '—'}</span></td><td className="px-3 py-4 font-mono text-xs text-[#9da7a2]">{player.nfl_team || 'FA'}</td>
          <td className="px-3 py-4 text-right font-mono font-medium text-white">{player.projected_total_points?.toFixed(1) ?? '—'}</td><td className="px-3 py-4 text-right"><span className="font-mono font-medium text-white">{player.median_rank?.toFixed(1) ?? '—'}</span>{player.source_count ? <span className="ml-1.5 text-[10px] text-[#65716b]">{player.source_count} src</span> : null}</td>
          <td className="px-3 py-4"><span className={`inline-flex items-center gap-1.5 text-xs ${player.injury_status ? 'text-amber-200' : 'text-[#78847e]'}`}><span className={`size-1.5 rounded-full ${player.injury_status ? 'bg-amber-300' : 'bg-[#4f5a54]'}`} />{player.injury_status || 'No designation'}</span></td><td className="px-5 py-4 text-right text-xs text-[#65716b] sm:px-6">{player.fetched_at ? new Date(player.fetched_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Not synced'}</td>
        </tr>)}</tbody>
      </table></div>
      {!players.data.items.length && <div className="px-6 py-16 text-center"><p className="text-sm font-medium text-white">No players found</p><p className="mt-1 text-sm text-[#78847e]">Try another name or position.</p></div>}
    </div>}
    <div className="mt-5 flex flex-col items-center justify-between gap-3 text-xs text-[#78847e] sm:flex-row"><span>Showing {players.data?.items.length || 0} of {players.data?.total || 0} players</span><div className="flex items-center gap-2"><button aria-label="Previous page" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="focus-ring rounded-lg border border-white/[.09] px-3 py-2 font-medium transition hover:bg-white/[.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">← Previous</button><span className="px-2 font-mono text-[#aab4af]">{page} / {totalPages}</span><button aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="focus-ring rounded-lg border border-white/[.09] px-3 py-2 font-medium transition hover:bg-white/[.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-30">Next →</button></div></div>
  </div>
}
