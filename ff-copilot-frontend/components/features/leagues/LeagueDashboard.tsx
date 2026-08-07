'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

type League = { id: string; name: string | null; external_id: string; season: number; last_synced_at: string | null }
type Team = { id: string; name: string; external_id: string }
type RosterPlayer = { lineup_slot: string | null; acquisition_type: string | null; player: { id: string; name: string; position: string | null; nfl_team: string | null } }
type Roster = { snapshot: { fetched_at: string; week: number | null } | null; players: RosterPlayer[] }

export function LeagueDashboard({ leagueId }: { leagueId: string }) {
  const seasons = useQuery({ queryKey: ['league-seasons', leagueId], queryFn: () => api<League[]>(`/v1/leagues/${leagueId}/seasons`) })
  const [selectedSeasonId, setSelectedSeasonId] = useState(leagueId)
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const selectedLeague = seasons.data?.find(league => league.id === selectedSeasonId) || seasons.data?.[0]
  const teams = useQuery({ queryKey: ['league-teams', selectedLeague?.id], queryFn: () => api<Team[]>(`/v1/leagues/${selectedLeague!.id}/teams`), enabled: Boolean(selectedLeague) })
  const selectedTeam = teams.data?.find(team => team.id === selectedTeamId) || teams.data?.[0]
  const roster = useQuery({ queryKey: ['team-roster', selectedTeam?.id], queryFn: () => api<Roster>(`/v1/teams/${selectedTeam!.id}/roster`), enabled: Boolean(selectedTeam) })

  useEffect(() => { if (seasons.data?.length && !seasons.data.some(league => league.id === selectedSeasonId)) setSelectedSeasonId(seasons.data[0].id) }, [seasons.data, selectedSeasonId])
  useEffect(() => { setSelectedTeamId('') }, [selectedSeasonId])

  if (seasons.isLoading) return <div className="mt-6 h-72 animate-pulse rounded-3xl bg-white/[.03]" />
  if (seasons.error || !selectedLeague) return <div role="alert" className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/[.06] p-6 text-sm text-red-200">We couldn&apos;t load this league. {seasons.error?.message}</div>

  return <div className="mt-6 space-y-5">
    <header className="panel rounded-3xl p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#b7f34a]">ESPN league · {selectedLeague.external_id}</p><div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><h1 className="text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">{selectedLeague.name || `League ${selectedLeague.external_id}`}</h1><p className="mt-3 text-sm text-[#78847e]">Teams, rosters, and season history in one place.</p></div><div className="flex flex-wrap gap-2" aria-label="League season">{seasons.data?.map(league => <button key={league.id} onClick={() => setSelectedSeasonId(league.id)} className={`focus-ring rounded-lg px-3 py-2 text-xs font-semibold transition ${league.id === selectedLeague.id ? 'bg-[#b7f34a] text-[#10140a]' : 'border border-white/[.09] text-[#9da7a2] hover:text-white'}`}>{league.season}</button>)}</div></div></header>

    {!teams.isLoading && !teams.data?.length ? <section className="panel rounded-2xl px-6 py-20 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/[.04] text-xl text-[#65716b]">○</div><h2 className="mt-4 font-semibold text-white">Pre-draft season</h2><p className="mt-2 text-sm text-[#78847e]">Teams and rosters are not available for {selectedLeague.season} yet. They&apos;ll appear after the league drafts.</p></section> : <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="panel overflow-hidden rounded-2xl"><div className="border-b border-white/[.07] px-5 py-4"><h2 className="font-semibold text-white">League teams</h2><p className="mt-1 text-xs text-[#65716b]">{teams.data?.length || 0} teams · {selectedLeague.season}</p></div><div className="divide-y divide-white/[.055]">{teams.data?.map(team => <button key={team.id} onClick={() => setSelectedTeamId(team.id)} className={`focus-ring flex w-full items-center justify-between px-5 py-4 text-left text-sm transition ${selectedTeam?.id === team.id ? 'bg-[#b7f34a]/[.07] text-[#d8faa0]' : 'text-[#aab4af] hover:bg-white/[.025] hover:text-white'}`}><span className="font-medium">{team.name}</span><span>→</span></button>)}</div></aside>
      <section className="panel overflow-hidden rounded-2xl"><div className="flex flex-col justify-between gap-3 border-b border-white/[.07] px-5 py-5 sm:flex-row sm:items-end sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#65716b]">Roster</p><h2 className="mt-1 text-xl font-semibold text-white">{selectedTeam?.name || 'Select a team'}</h2></div>{roster.data?.snapshot && <p className="text-xs text-[#65716b]">Updated {new Date(roster.data.snapshot.fetched_at).toLocaleString()}</p>}</div>
        {roster.isLoading ? <div className="space-y-2 p-6">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-white/[.025]" />)}</div> : roster.data?.players.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-white/[.06] text-[10px] uppercase tracking-[.14em] text-[#65716b]"><th className="px-5 py-3 sm:px-6">Player</th><th>Position</th><th>NFL team</th><th>Lineup slot</th><th className="pr-6">Acquired</th></tr></thead><tbody className="divide-y divide-white/[.055]">{roster.data.players.map(row => <tr key={row.player.id}><td className="px-5 py-4 font-medium text-white sm:px-6">{row.player.name}</td><td>{row.player.position || '—'}</td><td className="font-mono text-xs text-[#9da7a2]">{row.player.nfl_team || 'FA'}</td><td className="text-[#9da7a2]">{row.lineup_slot || 'Roster'}</td><td className="pr-6 text-xs text-[#65716b]">{row.acquisition_type || '—'}</td></tr>)}</tbody></table></div> : <div className="px-6 py-20 text-center"><h3 className="font-medium text-white">No roster yet</h3><p className="mt-2 text-sm text-[#78847e]">This team&apos;s roster will appear after the {selectedLeague.season} draft.</p></div>}
      </section>
    </div>}
  </div>
}
