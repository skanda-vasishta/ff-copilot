'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useActiveScope } from '@/lib/scope'
import { createClient } from '@/lib/supabase/client'

type League = { id: string; name: string | null; external_id: string; season: number; last_synced_at: string | null }
type LinkedLeague = { state: 'available' | 'being_prepared'; league: League }
type LeagueTeam = { id: string; name: string; league_id: string }
type WorkspaceTeam = { created_at: string; team: LeagueTeam & { league: League } }

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { scope, setTeam } = useActiveScope()
  const [leagueId, setLeagueId] = useState('')
  const [externalId, setExternalId] = useState('')
  const [season, setSeason] = useState(2026)

  const leagues = useQuery({ queryKey: ['my-leagues'], queryFn: () => api<LinkedLeague[]>('/v1/me/leagues') })
  const workspaceTeams = useQuery({ queryKey: ['my-teams'], queryFn: () => api<WorkspaceTeam[]>('/v1/me/teams') })
  const availableLeagues = useMemo(() => leagues.data?.filter(({ state }) => state === 'available') || [], [leagues.data])
  useEffect(() => {
    if (!leagueId && availableLeagues.length) setLeagueId(scope?.team.league_id || availableLeagues[0].league.id)
  }, [availableLeagues, leagueId, scope])
  const leagueTeams = useQuery({ queryKey: ['league-teams', leagueId], queryFn: () => api<LeagueTeam[]>(`/v1/leagues/${leagueId}/teams`), enabled: Boolean(leagueId) })
  const addedIds = new Set(workspaceTeams.data?.map(({ team }) => team.id))

  const connect = useMutation({
    mutationFn: () => api<{ state: string }>('/v1/me/leagues', { method: 'POST', body: JSON.stringify({ provider: 'espn', external_id: externalId.trim(), season }) }),
    onSuccess: () => { setExternalId(''); queryClient.invalidateQueries({ queryKey: ['my-leagues'] }) },
  })
  const addTeam = useMutation({
    mutationFn: (teamId: string) => api('/v1/me/teams', { method: 'POST', body: JSON.stringify({ team_id: teamId }) }),
    onSuccess: async (_, teamId) => {
      await queryClient.invalidateQueries({ queryKey: ['my-teams'] })
      if (!scope) await setTeam(teamId)
    },
  })
  const removeTeam = useMutation({
    mutationFn: (teamId: string) => api(`/v1/me/teams/${teamId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-teams'] }),
  })

  function submit(event: FormEvent) { event.preventDefault(); connect.mutate() }

  return <div className="mx-auto w-full max-w-[980px] px-5 py-10 sm:px-7 sm:py-14">
    <div className="max-w-xl">
      <p className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#91b944]">Settings</p>
      <h1 className="mt-2 text-[26px] font-semibold tracking-[-.035em] text-[#f1f3ed]">Teams and leagues</h1>
      <p className="mt-2 text-[13px] leading-6 text-[#81897c]">Add ESPN leagues and choose which teams belong in your workspace. Switch between added teams from the header.</p>
    </div>

    <div className="mt-9 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <section className="overflow-hidden rounded-[11px] border border-white/[.075] bg-[#10120f]/85">
        <div className="border-b border-white/[.065] px-5 py-4">
          <h2 className="text-[14px] font-semibold text-[#eef1e9]">Workspace teams</h2>
          <p className="mt-1 text-[11px] text-[#737b70]">These are the teams available in the header switcher.</p>
        </div>
        <div className="divide-y divide-white/[.055]">
          {workspaceTeams.isLoading && <p className="px-5 py-5 text-xs text-[#747c70]">Loading teams…</p>}
          {workspaceTeams.data?.map(({ team }) => {
            const active = scope?.team.id === team.id
            return <div key={team.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className={`grid size-8 shrink-0 place-items-center rounded-[6px] border text-[10px] font-bold ${active ? 'border-[#c9f958]/25 bg-[#c9f958]/10 text-[#c9f958]' : 'border-white/[.075] text-[#798173]'}`}>{team.name.slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[#e4e7df]">{team.name}</p><p className="mt-0.5 truncate text-[10px] text-[#697166]">{team.league.name || `ESPN ${team.league.external_id}`} · {team.league.season}</p></div>
              {active ? <span className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#a8d94c]">Active</span> : <button type="button" onClick={() => removeTeam.mutate(team.id)} disabled={removeTeam.isPending} className="focus-ring rounded-[6px] px-2 py-1.5 text-[10px] text-[#737b70] hover:bg-white/[.04] hover:text-red-200 disabled:opacity-40">Remove</button>}
            </div>
          })}
          {!workspaceTeams.isLoading && !workspaceTeams.data?.length && <div className="px-5 py-8 text-center"><p className="text-[13px] text-[#b3baae]">No teams added</p><p className="mt-1 text-[11px] text-[#697166]">Connect a league, then add your team below.</p></div>}
        </div>
      </section>

      <form onSubmit={submit} className="self-start rounded-[11px] border border-white/[.075] bg-[#10120f]/85 p-5">
        <h2 className="text-[14px] font-semibold text-[#eef1e9]">Connect an ESPN league</h2>
        <p className="mt-1 text-[11px] leading-5 text-[#737b70]">Public league data is imported by league ID and season.</p>
        <label className="mt-5 block text-[9px] font-semibold uppercase tracking-[.14em] text-[#687063]">League ID</label>
        <input required inputMode="numeric" value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="e.g. 1232540066" className="focus-ring mt-1.5 h-9 w-full rounded-[6px] border border-white/[.08] bg-[#090a08] px-3 text-xs text-white placeholder:text-[#4f554c]" />
        <label className="mt-4 block text-[9px] font-semibold uppercase tracking-[.14em] text-[#687063]">Season</label>
        <input required type="number" min="2020" max="2100" value={season} onChange={(event) => setSeason(Number(event.target.value))} className="focus-ring mt-1.5 h-9 w-full rounded-[6px] border border-white/[.08] bg-[#090a08] px-3 text-xs text-white" />
        {connect.error && <p className="mt-3 text-[11px] text-red-300">{connect.error.message}</p>}
        <button disabled={connect.isPending} className="focus-ring mt-4 h-9 w-full rounded-[6px] bg-[#c9f958] px-3 text-xs font-semibold text-[#12170b] transition hover:bg-[#d7ff78] disabled:opacity-50">{connect.isPending ? 'Connecting…' : 'Connect league'}</button>
      </form>
    </div>

    <section className="mt-5 overflow-hidden rounded-[11px] border border-white/[.075] bg-[#10120f]/85">
      <div className="flex flex-col gap-3 border-b border-white/[.065] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-[14px] font-semibold text-[#eef1e9]">Add a team</h2><p className="mt-1 text-[11px] text-[#737b70]">Choose a connected league, then add one or more teams.</p></div>
        <select value={leagueId} onChange={(event) => setLeagueId(event.target.value)} className="focus-ring h-8 min-w-56 rounded-[6px] border border-white/[.08] bg-[#090a08] px-2.5 text-[11px] text-[#c5cbc0]">
          {!availableLeagues.length && <option value="">No connected leagues</option>}
          {availableLeagues.map(({ league }) => <option key={league.id} value={league.id}>{league.name || `ESPN ${league.external_id}`} · {league.season}</option>)}
        </select>
      </div>
      <div className="grid gap-px bg-white/[.055] sm:grid-cols-2 lg:grid-cols-3">
        {leagueTeams.data?.map((team) => {
          const added = addedIds.has(team.id)
          return <div key={team.id} className="flex items-center gap-3 bg-[#10120f] px-4 py-3"><span className="grid size-7 shrink-0 place-items-center rounded-[5px] border border-white/[.07] text-[9px] font-bold text-[#7f8779]">{team.name.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-xs text-[#c2c8bd]">{team.name}</span><button type="button" disabled={added || addTeam.isPending} onClick={() => addTeam.mutate(team.id)} className={`focus-ring rounded-[5px] px-2 py-1.5 text-[10px] ${added ? 'text-[#7b8475]' : 'border border-[#c9f958]/20 text-[#b9e75c] hover:bg-[#c9f958]/8'} disabled:cursor-default`}>{added ? 'Added' : 'Add'}</button></div>
        })}
        {leagueTeams.isLoading && <p className="bg-[#10120f] px-5 py-6 text-xs text-[#747c70]">Loading league teams…</p>}
        {!leagueId && <p className="bg-[#10120f] px-5 py-6 text-xs text-[#747c70]">Connect a league to see its teams.</p>}
      </div>
      {leagues.data?.some(({ state }) => state === 'being_prepared') && <p className="border-t border-white/[.06] px-5 py-3 text-[10px] text-[#8b927f]">A connected league is still being imported. Its teams will appear here when the import completes.</p>}
    </section>

    <div className="mt-8 flex justify-end border-t border-white/[.065] pt-5"><button type="button" onClick={async () => { await createClient().auth.signOut(); location.assign('/login') }} className="focus-ring rounded-[6px] px-2.5 py-2 text-[11px] text-[#777f73] hover:bg-white/[.04] hover:text-red-200">Sign out</button></div>
  </div>
}
