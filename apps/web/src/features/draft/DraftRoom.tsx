'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useActiveScope } from '@/lib/scope'
import { createClient } from '@/lib/supabase/client'
import { createDraftSession, getDraftState, listDraftSessions, recordDraftPick, removeDraftPick } from './client'
import type { DraftPlayer, DraftTeam } from './types'
import { DraftCopilot } from './DraftCopilot'

type LeagueSettings = { league_settings: { draft_settings?: { pick_order?: Array<string | number>; type?: string } } | null }
type Consensus = { items: Array<{ player: DraftPlayer; position_consensus_average: number; overall_consensus_average: number | null }> }

function teamForPick(order: string[], type: 'snake' | 'linear', overall: number) {
  const round = Math.floor((overall - 1) / order.length), offset = (overall - 1) % order.length
  return order[type === 'snake' && round % 2 === 1 ? order.length - 1 - offset : offset]
}

export function DraftRoom() {
  const { scope, isLoading: scopeLoading } = useActiveScope()
  const client = useQueryClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const sessions = useQuery({ queryKey: ['draft-sessions', scope?.team.league_id], queryFn: () => listDraftSessions(scope!.team.league_id), enabled: Boolean(scope) })
  useEffect(() => { if (!sessionId && sessions.data?.length) setSessionId(sessions.data[0].id) }, [sessionId, sessions.data])
  const state = useQuery({ queryKey: ['draft-state', sessionId], queryFn: () => getDraftState(sessionId!), enabled: Boolean(sessionId) })
  if (scopeLoading) return <p className="p-8 text-sm text-[#78847e]">Loading…</p>
  if (!scope) return <div className="mx-auto max-w-lg p-16 text-center"><h1 className="text-2xl font-semibold text-white">Select a team first</h1><p className="mt-2 text-sm text-[#78847e]">Drafts use the active league and team.</p></div>
  if (creating || (!sessions.isLoading && !sessions.data?.length)) return <DraftSetup scope={scope} onCancel={sessions.data?.length ? () => setCreating(false) : undefined} onCreated={(id) => { client.invalidateQueries({ queryKey: ['draft-sessions'] }); setSessionId(id); setCreating(false) }} />
  return <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[.06] px-4">
      <select value={sessionId || ''} onChange={(event) => setSessionId(event.target.value)} className="h-8 rounded-[6px] border border-white/[.08] bg-white/[.03] px-2 text-xs text-[#cbd1c5]">{sessions.data?.map((session) => <option key={session.id} value={session.id}>{session.name}</option>)}</select>
      <button onClick={() => setCreating(true)} className="h-8 rounded-[6px] px-2.5 text-xs text-[#858d80] hover:bg-white/[.04] hover:text-white">+ New draft</button>
      {state.data && <><span className="ml-auto text-[10px] uppercase tracking-[.1em] text-[#697166]">{state.data.session.draft_type} · {state.data.session.round_count} rounds</span><span className="rounded-[5px] bg-[#c9f958]/10 px-2 py-1 text-[10px] text-[#b8e65b]">{state.data.session.status}</span></>}
    </div>
    {state.isLoading ? <p className="p-8 text-sm text-[#78847e]">Loading draft…</p> : state.data ? <ActiveDraft state={state.data} teams={[]} onChanged={() => client.invalidateQueries({ queryKey: ['draft-state', sessionId] })} /> : null}
  </div>
}

function DraftSetup({ scope, onCreated, onCancel }: { scope: NonNullable<ReturnType<typeof useActiveScope>['scope']>; onCreated: (id: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState(`${scope.team.league.season} Draft`)
  const [draftType, setDraftType] = useState<'snake' | 'linear'>('snake')
  const [roundCount, setRoundCount] = useState(16)
  const [order, setOrder] = useState<string[]>([])
  const [error, setError] = useState('')
  const teams = useQuery({ queryKey: ['league-teams', scope.team.league_id], queryFn: () => api<DraftTeam[]>(`/v1/leagues/${scope.team.league_id}/teams`) })
  const league = useQuery({ queryKey: ['draft-league-settings', scope.team.league_id], queryFn: async () => { const { data, error } = await createClient().from('leagues').select('league_settings').eq('id', scope.team.league_id).single(); if (error) throw error; return data as LeagueSettings } })
  useEffect(() => {
    if (!teams.data?.length || order.length) return
    const espnOrder = league.data?.league_settings?.draft_settings?.pick_order?.map(String) || []
    const byExternal = new Map(teams.data.map((team) => [String(team.external_id), team.id]))
    const resolved = espnOrder.map((id) => byExternal.get(id)).filter((id): id is string => Boolean(id))
    setOrder(resolved.length === teams.data.length ? resolved : teams.data.map((team) => team.id))
  }, [teams.data, league.data, order.length])
  const byId = new Map(teams.data?.map((team) => [team.id, team]))
  function move(index: number, delta: number) { setOrder((current) => { const next = [...current], target = index + delta; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next }) }
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); try { const session = await createDraftSession({ leagueId: scope.team.league_id, selectedTeamId: scope.team.id, season: scope.team.league.season, name, draftType, teamOrder: order, roundCount }); onCreated(session.id) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create draft') } }
  return <div className="mx-auto w-full max-w-[760px] px-5 py-10"><div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[.14em] text-[#8daa48]">Manual draft</p><h1 className="mt-2 text-2xl font-semibold text-white">Create draft workspace</h1></div>{onCancel && <button onClick={onCancel} className="text-xs text-[#78847e]">Cancel</button>}</div>
    <form onSubmit={submit} className="mt-7 grid gap-5 rounded-[10px] border border-white/[.07] bg-white/[.02] p-5">
      <div className="grid gap-4 sm:grid-cols-3"><label className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-9 w-full rounded-[6px] border border-white/[.08] bg-black/15 px-3 text-xs normal-case tracking-normal text-white"/></label><label className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Type<select value={draftType} onChange={(e) => setDraftType(e.target.value as 'snake' | 'linear')} className="mt-1.5 h-9 w-full rounded-[6px] border border-white/[.08] bg-black/15 px-3 text-xs normal-case tracking-normal text-white"><option value="snake">Snake</option><option value="linear">Linear</option></select></label><label className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Rounds<input type="number" min={1} max={40} value={roundCount} onChange={(e) => setRoundCount(Number(e.target.value))} className="mt-1.5 h-9 w-full rounded-[6px] border border-white/[.08] bg-black/15 px-3 text-xs normal-case tracking-normal text-white"/></label></div>
      <div><div className="flex items-center justify-between"><p className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Draft order</p><p className="text-[10px] text-[#687063]">Imported from ESPN when available</p></div><div className="mt-2 divide-y divide-white/[.055] rounded-[7px] border border-white/[.07]">{order.map((id, index) => <div key={id} className="flex h-9 items-center gap-3 px-3 text-xs"><span className="w-5 font-mono text-[10px] text-[#687063]">{index + 1}</span><span className="flex-1 text-[#c8cec2]">{byId.get(id)?.name || id}{id === scope.team.id ? ' (your team)' : ''}</span><button type="button" onClick={() => move(index,-1)} className="text-[#687063] hover:text-white">↑</button><button type="button" onClick={() => move(index,1)} className="text-[#687063] hover:text-white">↓</button></div>)}</div></div>
      {error && <p className="text-xs text-red-300">{error}</p>}<button disabled={order.length < 2} className="h-9 rounded-[6px] bg-[#c9f958] text-xs font-semibold text-[#13190d] disabled:opacity-30">Create draft</button>
    </form>
  </div>
}

function ActiveDraft({ state, onChanged }: { state: Awaited<ReturnType<typeof getDraftState>>; teams: DraftTeam[]; onChanged: () => void }) {
  const session = state.session
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState('ALL')
  const pool = useQuery({ queryKey: ['draft-player-pool', session.season], queryFn: () => api<{ items: DraftPlayer[] }>(`/v1/draft/player-pool?season=${session.season}`) })
  const teams = useQuery({ queryKey: ['league-teams', session.league_id], queryFn: () => api<DraftTeam[]>(`/v1/leagues/${session.league_id}/teams`) })
  const consensus = useQuery({ queryKey: ['draft-consensus', session.season], queryFn: async () => { const rows = await Promise.all(['QB','RB','WR','TE'].map((pos) => api<Consensus>(`/v1/rankings/consensus?season=${session.season}&position=${pos}&limit=100`))); return rows.flatMap((row) => row.items) } })
  const mutate = useMutation({ mutationFn: ({ playerId, overall }: { playerId: string; overall: number }) => recordDraftPick(session.id, playerId, overall, session.revision), onSuccess: onChanged })
  const remove = useMutation({ mutationFn: (overall: number) => removeDraftPick(session.id, overall, session.revision), onSuccess: onChanged })
  const drafted = new Set(state.picks.map((pick) => pick.player_id))
  const rankByPlayer = new Map(consensus.data?.map((row) => [row.player.id, { position: row.position_consensus_average, overall: row.overall_consensus_average }]))
  const available = (pool.data?.items || []).filter((player) => !drafted.has(player.id) && ['QB','RB','WR','TE'].includes(player.position || '')).filter((player) => position === 'ALL' || player.position === position).filter((player) => player.name.toLowerCase().includes(search.toLowerCase())).sort((a,b) => {
    const left = rankByPlayer.get(a.id), right = rankByPlayer.get(b.id)
    if (position !== 'ALL') return (left?.position ?? 999) - (right?.position ?? 999)
    return (left?.overall ?? 9999) - (right?.overall ?? 9999) || (left?.position ?? 999) - (right?.position ?? 999)
  })
  const teamById = new Map(teams.data?.map((team) => [team.id, team]))
  const pickByOverall = new Map(state.picks.map((pick) => [pick.overall_pick, pick]))
  const total = session.team_order.length * session.round_count
  const currentTeam = teamById.get(teamForPick(session.team_order, session.draft_type, Math.min(session.current_overall_pick,total)))
  const myPicks = state.picks.filter((pick) => pick.fantasy_team_id === session.selected_team_id)
  return <div className="flex min-h-0 flex-1 flex-col">
    <section className="shrink-0 border-b border-white/[.06] bg-white/[.012]">
      <div className="flex items-center justify-between px-4 py-2"><div><p className="text-[9px] uppercase tracking-[.12em] text-[#687063]">On the clock</p><p className="mt-0.5 text-xs font-semibold text-white">Pick {session.current_overall_pick} · {currentTeam?.name || 'Complete'}</p></div><p className="text-[9px] text-[#687063]">Scroll to review · click × to remove a pick</p></div>
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-3">{Array.from({length:total},(_,index)=>{const overall=index+1,teamId=teamForPick(session.team_order,session.draft_type,overall),pick=pickByOverall.get(overall),round=Math.floor(index/session.team_order.length)+1;return <div key={overall} className={`group relative w-[132px] shrink-0 rounded-[6px] border px-2.5 py-2 ${overall===session.current_overall_pick?'border-[#c9f958]/40 bg-[#c9f958]/10':'border-white/[.055] bg-white/[.018]'}`}><div className="flex items-center justify-between text-[8px] uppercase tracking-[.08em] text-[#687063]"><span>R{round} · {overall}</span>{pick&&<button onClick={()=>remove.mutate(overall)} className="text-transparent group-hover:text-[#78847e]">×</button>}</div><p className={`mt-1 truncate text-[10px] ${pick?'font-medium text-[#d5dbcf]':'text-[#7d8578]'}`}>{pick?.player.name||teamById.get(teamId)?.name}</p><p className="mt-0.5 truncate text-[8px] text-[#5f675c]">{teamById.get(teamId)?.name}</p></div>})}</div>
    </section>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_460px]">
      <main className="flex min-h-0 flex-col border-r border-white/[.06]"><div className="shrink-0 border-b border-white/[.06] p-3"><div className="flex gap-2"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search available players" className="h-9 min-w-0 flex-1 rounded-[6px] border border-white/[.07] bg-white/[.025] px-3 text-xs text-white"/><div className="flex gap-1">{['ALL','QB','RB','WR','TE'].map((pos)=><button key={pos} onClick={()=>setPosition(pos)} className={`rounded-[5px] px-2 text-[10px] ${position===pos?'bg-[#c9f958] text-[#15200b]':'text-[#78847e] hover:bg-white/[.04]'}`}>{pos}</button>)}</div></div></div><div className="min-h-0 overflow-y-auto"><div className="grid grid-cols-[42px_minmax(0,1fr)_54px_52px_72px_60px] border-b border-white/[.05] px-3 py-2 text-[9px] uppercase tracking-[.08em] text-[#687063]"><span>OVR</span><span>Player</span><span>Pos RK</span><span>Pos</span><span>Proj</span><span></span></div>{available.slice(0,300).map((player)=>{const rank=rankByPlayer.get(player.id);return <div key={player.id} className="grid grid-cols-[42px_minmax(0,1fr)_54px_52px_72px_60px] items-center border-b border-white/[.045] px-3 py-2.5 text-xs hover:bg-white/[.02]"><span className="font-mono text-[10px] text-[#9fa79a]">{rank?.overall?.toFixed(1)||'—'}</span><span className="truncate font-medium text-[#dce1d6]">{player.name} <span className="text-[10px] font-normal text-[#687063]">{player.nfl_team}</span></span><span className="font-mono text-[10px] text-[#9fa79a]">{rank?.position?.toFixed(1)||'—'}</span><span className="text-[#9fa79a]">{player.position}</span><span className="font-mono text-[10px] text-[#9fa79a]">{player.projected_total_points?.toFixed(1)||'—'}</span><button disabled={session.status==='completed'||mutate.isPending} onClick={()=>mutate.mutate({playerId:player.id,overall:session.current_overall_pick})} className="h-7 rounded-[5px] bg-[#c9f958]/10 text-[10px] font-semibold text-[#b8e65b] hover:bg-[#c9f958]/15 disabled:opacity-30">Draft</button></div>})}</div></main>
      <aside className="flex min-h-0 flex-col"><div className="max-h-[30%] overflow-y-auto border-b border-white/[.06]"><div className="sticky top-0 bg-[#0c0e0b]/95 px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8daa48]">Your roster</p><p className="mt-1 text-xs text-[#737b70]">{teamById.get(session.selected_team_id)?.name}</p></div>{myPicks.map((pick)=><div key={pick.id} className="flex items-center gap-2 border-t border-white/[.045] px-4 py-2.5 text-xs"><span className="w-7 font-mono text-[9px] text-[#687063]">{pick.overall_pick}</span><span className="flex-1 text-[#c8cec2]">{pick.player.name}</span><span className="text-[10px] text-[#687063]">{pick.player.position}</span></div>)}{!myPicks.length&&<p className="px-4 pb-4 text-xs text-[#687063]">No picks yet.</p>}</div><DraftCopilot key={session.revision} thread={state.thread} season={session.season}/></aside>
    </div>
  </div>
}
