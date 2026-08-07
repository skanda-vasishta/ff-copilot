'use client'

import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

type LinkedLeague = { created_at: string; league: { id: string; name: string | null; external_id: string; season: number; status: string; last_synced_at: string | null } }
type FantasyTeam = { id: string; name: string; external_id: string }
type SelectedTeam = { team: { id: string } }

function LeagueTeams({ leagueId }: { leagueId: string }) {
  const client = useQueryClient()
  const teams = useQuery({ queryKey: ['league-teams', leagueId], queryFn: () => api<FantasyTeam[]>(`/v1/leagues/${leagueId}/teams`) })
  const selected = useQuery({ queryKey: ['my-teams'], queryFn: () => api<SelectedTeam[]>('/v1/me/teams') })
  const selectedIds = new Set(selected.data?.map(row => row.team.id) || [])
  const toggle = useMutation({
    mutationFn: ({ teamId, enabled }: { teamId: string; enabled: boolean }) => enabled
      ? api('/v1/me/teams', { method: 'POST', body: JSON.stringify({ team_id: teamId }) })
      : api(`/v1/me/teams/${teamId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['my-teams'] }),
  })
  if (teams.isLoading) return <p className="mt-3 text-sm text-slate-500">Loading teams…</p>
  return <div className="mt-4 flex flex-wrap gap-2">{teams.data?.map(team => {
    const enabled = selectedIds.has(team.id)
    return <button key={team.id} onClick={() => toggle.mutate({ teamId: team.id, enabled: !enabled })} className={`rounded-full border px-3 py-1.5 text-xs ${enabled ? 'border-emerald-400 bg-emerald-400/10 text-emerald-300' : 'border-slate-700 text-slate-400 hover:text-white'}`}>{enabled ? '✓ ' : '+ '}{team.name}</button>
  })}</div>
}

export function LeagueManager() {
  const client = useQueryClient()
  const [leagueId, setLeagueId] = useState('')
  const [season, setSeason] = useState(2026)
  const leagues = useQuery({ queryKey: ['my-leagues'], queryFn: () => api<LinkedLeague[]>('/v1/me/leagues') })
  const link = useMutation({ mutationFn: () => api('/v1/me/leagues', { method: 'POST', body: JSON.stringify({ provider: 'espn', external_id: leagueId, season }) }), onSuccess: () => { setLeagueId(''); client.invalidateQueries({ queryKey: ['my-leagues'] }); client.invalidateQueries({ queryKey: ['sync-status'] }) } })
  const sync = useQuery({ queryKey: ['sync-status'], queryFn: () => api<{requests: {id:string; external_id:string; status:string; requested_at:string}[]}>('/v1/sync-status') })
  function submit(e: FormEvent) { e.preventDefault(); link.mutate() }
  return <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-lg font-semibold text-white">Your leagues</h2>
      <div className="mt-4 space-y-3">{leagues.data?.map(({ league }) => <div key={league.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4"><div className="flex justify-between"><div><p className="font-medium text-white">{league.name || `ESPN ${league.external_id}`}</p><p className="mt-1 text-sm text-slate-500">{league.season} · {league.status}</p></div><span className="text-xs text-slate-500">{league.last_synced_at ? new Date(league.last_synced_at).toLocaleString() : 'Awaiting sync'}</span></div>{league.status === 'succeeded' && <LeagueTeams leagueId={league.id} />}</div>)}
      {!leagues.isLoading && !leagues.data?.length && <p className="py-8 text-center text-slate-500">No synced leagues linked yet.</p>}</div>
    </section>
    <div className="space-y-6"><form onSubmit={submit} className="rounded-xl border border-slate-800 bg-slate-900 p-6"><h2 className="font-semibold text-white">Link public ESPN league</h2><p className="mt-1 text-sm text-slate-500">New leagues enter the operator sync queue.</p>
      <input required value={leagueId} onChange={e => setLeagueId(e.target.value)} placeholder="League ID" className="mt-5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
      <input required type="number" value={season} onChange={e => setSeason(Number(e.target.value))} className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
      {link.error && <p className="mt-3 text-sm text-red-300">{link.error.message}</p>}<button disabled={link.isPending} className="mt-4 w-full rounded-lg bg-emerald-400 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50">{link.isPending ? 'Linking…' : 'Link league'}</button>
    </form><section className="rounded-xl border border-slate-800 bg-slate-900 p-6"><h2 className="font-semibold text-white">Pending syncs</h2><div className="mt-3 space-y-2 text-sm text-slate-400">{sync.data?.requests.map(request => <p key={request.id}>ESPN {request.external_id} <span className="text-amber-300">{request.status}</span></p>)}{!sync.data?.requests.length && <p>Nothing pending.</p>}</div></section></div>
  </div>
}
