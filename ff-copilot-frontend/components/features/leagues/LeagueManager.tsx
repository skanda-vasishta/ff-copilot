'use client'

import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { SyncOverview, useSyncStatus } from '@/components/features/sync/SyncOverview'

type LinkedLeague = { created_at: string; league: { id: string; name: string | null; external_id: string; season: number; status: string; last_synced_at: string | null } }
type FantasyTeam = { id: string; name: string; external_id: string }
type SelectedTeam = { team: { id: string } }

function LeagueTeams({ leagueId }: { leagueId: string }) {
  const client = useQueryClient()
  const teams = useQuery({ queryKey: ['league-teams', leagueId], queryFn: () => api<FantasyTeam[]>(`/v1/leagues/${leagueId}/teams`) })
  const selected = useQuery({ queryKey: ['my-teams'], queryFn: () => api<SelectedTeam[]>('/v1/me/teams') })
  const selectedIds = new Set(selected.data?.map(row => row.team.id) || [])
  const toggle = useMutation({ mutationFn: ({ teamId, enabled }: { teamId: string; enabled: boolean }) => enabled ? api('/v1/me/teams', { method: 'POST', body: JSON.stringify({ team_id: teamId }) }) : api(`/v1/me/teams/${teamId}`, { method: 'DELETE' }), onSuccess: () => client.invalidateQueries({ queryKey: ['my-teams'] }) })
  if (teams.isLoading) return <p className="mt-4 text-xs text-[#65716b]">Loading teams…</p>
  return <div className="mt-5 border-t border-white/[.06] pt-4"><p className="mb-3 text-[10px] font-semibold uppercase tracking-[.14em] text-[#65716b]">Select your teams</p><div className="flex flex-wrap gap-2">{teams.data?.map(team => { const enabled = selectedIds.has(team.id); return <button key={team.id} disabled={toggle.isPending} onClick={() => toggle.mutate({ teamId: team.id, enabled: !enabled })} className={`focus-ring rounded-lg border px-3 py-2 text-xs font-medium transition ${enabled ? 'border-[#b7f34a]/30 bg-[#b7f34a]/10 text-[#c8f775]' : 'border-white/[.09] text-[#8c9992] hover:bg-white/[.04] hover:text-white'}`}>{enabled ? '✓ ' : '+ '}{team.name}</button> })}</div></div>
}

export function LeagueManager() {
  const client = useQueryClient(); const [leagueId, setLeagueId] = useState(''); const [season, setSeason] = useState(2026)
  const leagues = useQuery({ queryKey: ['my-leagues'], queryFn: () => api<LinkedLeague[]>('/v1/me/leagues') })
  const link = useMutation({ mutationFn: () => api('/v1/me/leagues', { method: 'POST', body: JSON.stringify({ provider: 'espn', external_id: leagueId, season }) }), onSuccess: () => { setLeagueId(''); client.invalidateQueries({ queryKey: ['my-leagues'] }); client.invalidateQueries({ queryKey: ['sync-status'] }) } })
  const sync = useSyncStatus()
  function submit(e: FormEvent) { e.preventDefault(); link.mutate() }

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
    <section className="panel overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4 sm:px-6"><div><h2 className="font-semibold text-white">Connected leagues</h2><p className="mt-1 text-xs text-[#65716b]">{leagues.data?.length || 0} linked</p></div><span className="rounded-full bg-white/[.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#8c9992]">ESPN</span></div>
      <div className="divide-y divide-white/[.06]">{leagues.data?.map(({ league }) => <article key={league.id} className="p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-300/[.08] text-sm font-bold text-sky-200">E</span><div><h3 className="font-medium text-white">{league.name || `ESPN League ${league.external_id}`}</h3><p className="mt-1 text-xs text-[#65716b]">ID {league.external_id} · {league.season} season</p></div></div><div className="sm:text-right"><span className={`inline-flex items-center gap-1.5 text-xs ${league.status === 'succeeded' ? 'text-[#b7f34a]' : 'text-amber-200'}`}><span className="size-1.5 rounded-full bg-current" />{league.status}</span><p className="mt-1 text-[10px] text-[#58635d]">{league.last_synced_at ? `Updated ${new Date(league.last_synced_at).toLocaleString()}` : 'Awaiting first sync'}</p></div></div>{league.status === 'succeeded' && <LeagueTeams leagueId={league.id} />}</article>)}
      {!leagues.isLoading && !leagues.data?.length && <div className="px-6 py-16 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/[.04] text-xl text-[#65716b]">◉</span><p className="mt-4 text-sm font-medium text-white">No leagues connected</p><p className="mt-1 text-sm text-[#65716b]">Use your public ESPN league ID to get started.</p></div>}
      {leagues.isLoading && <div className="space-y-3 p-6">{[1,2].map(i => <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[.025]" />)}</div>}
      </div>
    </section>

    <aside className="space-y-5">
      <form onSubmit={submit} className="panel rounded-2xl p-5"><p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#b7f34a]">Add a league</p><h2 className="mt-2 font-semibold text-white">Connect public ESPN</h2><p className="mt-2 text-xs leading-5 text-[#78847e]">We&apos;ll queue a safe background sync. Your last good data stays available if a source fails.</p>
        <label className="mt-5 block"><span className="mb-2 block text-xs text-[#aab4af]">League ID</span><input required inputMode="numeric" value={leagueId} onChange={e => setLeagueId(e.target.value)} placeholder="e.g. 251954166" className="focus-ring w-full rounded-xl border border-white/[.09] bg-[#090d10] px-3.5 py-3 text-sm text-white placeholder:text-[#4f5a54] focus:border-[#b7f34a]/40" /></label>
        <label className="mt-3 block"><span className="mb-2 block text-xs text-[#aab4af]">Season</span><input aria-label="Season" required type="number" min="2025" max="2100" value={season} onChange={e => setSeason(Number(e.target.value))} className="focus-ring w-full rounded-xl border border-white/[.09] bg-[#090d10] px-3.5 py-3 text-sm text-white focus:border-[#b7f34a]/40" /></label>
        {link.error && <p role="alert" className="mt-3 text-xs leading-5 text-red-300">{link.error.message}</p>}<button disabled={link.isPending} className="focus-ring mt-4 w-full rounded-xl bg-[#b7f34a] px-3 py-3 text-sm font-bold text-[#10140a] transition hover:bg-[#c7ff5e] disabled:opacity-50">{link.isPending ? 'Adding to queue…' : 'Connect league'}</button>
      </form>
      <SyncOverview compact />
      <section className="panel rounded-2xl p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Your pending syncs</h2><span className="font-mono text-xs text-[#65716b]">{sync.data?.requests.length || 0}</span></div><div className="mt-3 space-y-2">{sync.data?.requests.map(request => <div key={request.id} className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2.5 text-xs"><span className="text-[#aab4af]">ESPN {request.external_id}</span><span className="text-amber-200">{request.status}</span></div>)}{!sync.data?.requests.length && <p className="text-xs text-[#65716b]">Nothing waiting in the queue.</p>}</div></section>
    </aside>
  </div>
}
