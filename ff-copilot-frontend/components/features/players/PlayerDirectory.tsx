'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, Player, Paginated, queryString } from '@/lib/api'

export function PlayerDirectory() {
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<'name' | 'projected_total_points' | 'average_rank'>('name')
  const query = queryString({ search, position, season: 2026, page, page_size: 25, sort, direction: sort === 'name' ? 'asc' : 'desc' })
  const players = useQuery({ queryKey: ['players', query], queryFn: () => api<Paginated<Player>>(`/v1/players?${query}`) })
  const totalPages = Math.max(1, Math.ceil((players.data?.total || 0) / 25))

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row">
      <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search players" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 outline-none focus:border-emerald-400" />
      <select value={position} onChange={e => { setPosition(e.target.value); setPage(1) }} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5">
        <option value="">All positions</option>{['QB','RB','WR','TE','K','D/ST'].map(p => <option key={p}>{p}</option>)}
      </select>
      <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5">
        <option value="name">Name</option><option value="projected_total_points">Projected points</option><option value="average_rank">Average rank</option>
      </select>
    </div>
    {players.isLoading && <p className="text-slate-400">Loading players…</p>}
    {players.error && <p className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">{players.error.message}</p>}
    {players.data && <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Player</th><th>Pos</th><th>Team</th><th>Projection</th><th>Median rank</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody className="divide-y divide-slate-800">{players.data.items.map(player => <tr key={player.id} className="hover:bg-slate-800/50">
          <td className="px-5 py-4 font-medium text-white">{player.name}</td><td>{player.position || '—'}</td><td>{player.nfl_team || 'FA'}</td>
          <td>{player.projected_total_points?.toFixed(1) ?? '—'}</td><td>{player.median_rank?.toFixed(1) ?? '—'}{player.source_count ? <span className="ml-1 text-xs text-slate-500">({player.source_count})</span> : null}</td>
          <td>{player.injury_status || '—'}</td><td className="pr-5 text-xs text-slate-500">{player.fetched_at ? new Date(player.fetched_at).toLocaleDateString() : 'Not synced'}</td>
        </tr>)}</tbody>
      </table></div>
      {!players.data.items.length && <p className="p-8 text-center text-slate-500">No players match these filters.</p>}
    </div>}
    <div className="flex items-center justify-between text-sm text-slate-400"><span>{players.data?.total || 0} players</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="rounded border border-slate-700 px-3 py-1.5 disabled:opacity-30">Previous</button><span className="px-2 py-1.5">{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded border border-slate-700 px-3 py-1.5 disabled:opacity-30">Next</button></div></div>
  </div>
}
