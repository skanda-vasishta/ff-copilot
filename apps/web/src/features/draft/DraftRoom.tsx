'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useActiveScope } from '@/lib/scope'
import { createClient } from '@/lib/supabase/client'
import { createDraftSession, getDraftState, listDraftSessions, recordDraftPick, removeDraftPick, renameDraftSession } from './client'
import type { DraftPlayer, DraftSession, DraftTeam } from './types'
import { DraftCopilot } from './DraftCopilot'
import { PlayerProfile } from '@/components/features/players/PlayerProfile'

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
  const state = useQuery({ queryKey: ['draft-state', sessionId], queryFn: () => getDraftState(sessionId!), enabled: Boolean(sessionId) })
  if (scopeLoading) return <p className="p-8 text-sm text-[#78847e]">Loading…</p>
  if (!scope) return <div className="mx-auto max-w-lg p-16 text-center"><h1 className="text-2xl font-semibold text-white">Select a team first</h1><p className="mt-2 text-sm text-[#78847e]">Drafts use the active league and team.</p></div>
  if (creating) return <DraftSetup scope={scope} onCancel={() => setCreating(false)} onCreated={(id) => { client.invalidateQueries({ queryKey: ['draft-sessions'] }); setSessionId(id); setCreating(false) }} />
  if (!sessionId) return <DraftLanding sessions={sessions.data || []} loading={sessions.isLoading} leagueName={scope.team.league.name || 'League'} season={scope.team.league.season} onOpen={setSessionId} onCreate={() => setCreating(true)} onRenamed={() => client.invalidateQueries({queryKey:['draft-sessions']})}/>
  return <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[.06] px-4">
      <button onClick={() => setSessionId(null)} className="h-8 rounded-[6px] px-2.5 text-xs text-[#858d80] hover:bg-white/[.04] hover:text-white">← All drafts</button>
      <span className="h-4 w-px bg-white/[.07]"/><span className="truncate text-xs font-medium text-[#cbd1c5]">{state.data?.session.name}</span>
      {state.data && <><span className="ml-auto text-[10px] uppercase tracking-[.1em] text-[#697166]">{state.data.session.draft_type} · {state.data.session.round_count} rounds</span><span className="rounded-[5px] bg-[#c9f958]/10 px-2 py-1 text-[10px] text-[#b8e65b]">{state.data.session.status}</span></>}
    </div>
    {state.isLoading ? <p className="p-8 text-sm text-[#78847e]">Loading draft…</p> : state.data ? <ActiveDraft state={state.data} teams={[]} onChanged={() => client.invalidateQueries({ queryKey: ['draft-state', sessionId] })} /> : null}
  </div>
}

function DraftLanding({ sessions, loading, leagueName, season, onOpen, onCreate, onRenamed }: { sessions: DraftSession[]; loading: boolean; leagueName: string; season: number; onOpen: (id: string) => void; onCreate: () => void; onRenamed: () => void }) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  async function saveRename(session: DraftSession) {
    setRenameError('')
    try { await renameDraftSession(session.id, renameValue); setRenamingId(null); onRenamed() }
    catch (cause) { setRenameError(cause instanceof Error ? cause.message : 'Could not rename draft') }
  }
  return <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
    <header className="flex flex-col justify-between gap-5 border-b border-white/[.07] pb-7 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#8daa48]">{leagueName} · {season}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] text-white">Drafts</h1><p className="mt-2 text-sm text-[#747c70]">Resume a draft or start a new manual run.</p></div><button onClick={onCreate} className="h-9 rounded-[6px] bg-[#c9f958] px-4 text-xs font-semibold text-[#13190d]">New draft</button></header>
    {renameError&&<p className="mt-4 text-xs text-red-300">{renameError}</p>}
    {loading?<div className="mt-6 grid gap-3 sm:grid-cols-2">{[0,1,2,3].map((item)=><div key={item} className="h-36 animate-pulse rounded-[8px] border border-white/[.05] bg-white/[.02]"/>)}</div>:sessions.length?<div className="mt-6 grid gap-3 sm:grid-cols-2">{sessions.map((session)=>{const total=session.team_order.length*session.round_count,completed=Math.min(session.current_overall_pick-1,total),progress=total?Math.round(completed/total*100):0,isRenaming=renamingId===session.id;return <div key={session.id} onClick={()=>!isRenaming&&onOpen(session.id)} className="group cursor-pointer rounded-[8px] border border-white/[.07] bg-white/[.018] p-5 text-left transition hover:border-white/[.13] hover:bg-white/[.028]"><div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1">{isRenaming?<div className="flex gap-2" onClick={(event)=>event.stopPropagation()}><input autoFocus value={renameValue} onChange={(event)=>setRenameValue(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')saveRename(session);if(event.key==='Escape')setRenamingId(null)}} className="h-8 min-w-0 flex-1 rounded-[5px] border border-white/[.1] bg-black/20 px-2 text-xs text-white"/><button onClick={()=>saveRename(session)} className="rounded-[5px] bg-[#c9f958] px-2 text-[10px] font-semibold text-[#13190d]">Save</button><button onClick={()=>setRenamingId(null)} className="px-1 text-[10px] text-[#737b70]">Cancel</button></div>:<div className="flex items-center gap-2"><h2 className="truncate text-base font-semibold text-[#dce1d6] group-hover:text-white">{session.name}</h2><button aria-label={`Rename ${session.name}`} onClick={(event)=>{event.stopPropagation();setRenameError('');setRenamingId(session.id);setRenameValue(session.name)}} className="rounded-[4px] px-1.5 py-1 text-[10px] text-[#697166] opacity-0 hover:bg-white/[.05] hover:text-white group-hover:opacity-100">Rename</button></div>}<p className="mt-1 text-[10px] uppercase tracking-[.1em] text-[#697166]">{session.draft_type} · {session.team_order.length} teams · {session.round_count} rounds</p></div><span className={`rounded-[5px] px-2 py-1 text-[9px] font-medium uppercase tracking-[.08em] ${session.status==='completed'?'bg-white/[.05] text-[#879087]':'bg-[#c9f958]/10 text-[#b8e65b]'}`}>{session.status}</span></div><div className="mt-7"><div className="flex justify-between text-[10px] text-[#697166]"><span>{completed} of {total} picks</span><span>{progress}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full bg-[#a9d64d]" style={{width:`${progress}%`}}/></div></div><div className="mt-4 flex items-center justify-between text-[10px] text-[#596158]"><span>Updated {new Date(session.updated_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span><span className="text-[#8b9487] group-hover:text-[#b8e65b]">Open →</span></div></div>})}</div>:<div className="mt-16 text-center"><p className="text-sm font-medium text-[#d2d7cc]">No draft runs yet</p><p className="mt-1 text-xs text-[#697166]">Create one to set the order and begin entering picks.</p><button onClick={onCreate} className="mt-5 h-9 rounded-[6px] border border-white/[.09] px-4 text-xs text-[#bdc4b9] hover:bg-white/[.03]">Create your first draft</button></div>}
  </main>
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
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<'players' | 'rosters'>('players')
  const [rosterTeamId, setRosterTeamId] = useState(session.selected_team_id)
  const [tickerAway, setTickerAway] = useState(false)
  const tickerRef = useRef<HTMLDivElement>(null)
  const currentPickRef = useRef<HTMLDivElement>(null)
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
  const rosterPicks = state.picks.filter((pick) => pick.fantasy_team_id === rosterTeamId)
  const goToLatestPick = () => currentPickRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  const updateTickerPosition = () => {
    const ticker = tickerRef.current, current = currentPickRef.current
    if (!ticker || !current) return
    const tickerBounds = ticker.getBoundingClientRect(), currentBounds = current.getBoundingClientRect()
    setTickerAway(currentBounds.left < tickerBounds.left || currentBounds.right > tickerBounds.right)
  }
  useEffect(() => { requestAnimationFrame(goToLatestPick) }, [session.current_overall_pick])
  return <div className="flex min-h-0 flex-1 flex-col">
    <section className="shrink-0 border-b border-white/[.06] bg-white/[.012]">
      <div className="flex items-center justify-between px-4 py-2"><div><p className="text-[9px] uppercase tracking-[.12em] text-[#687063]">On the clock</p><p className="mt-0.5 text-xs font-semibold text-white">Pick {session.current_overall_pick} · {currentTeam?.name || 'Complete'}</p></div><div className="flex items-center gap-3">{tickerAway&&<button onClick={goToLatestPick} className="rounded-[5px] bg-[#c9f958]/10 px-2 py-1 text-[9px] font-medium text-[#b8e65b]">Latest pick →</button>}<p className="text-[9px] text-[#687063]">Scroll to review · click × to remove</p></div></div>
      <div ref={tickerRef} onScroll={updateTickerPosition} className="flex gap-1.5 overflow-x-auto px-3 pb-3">{Array.from({length:total},(_,index)=>{const overall=index+1,teamId=teamForPick(session.team_order,session.draft_type,overall),pick=pickByOverall.get(overall),round=Math.floor(index/session.team_order.length)+1,isCurrent=overall===session.current_overall_pick;return <div ref={isCurrent?currentPickRef:undefined} key={overall} onClick={() => pick && setSelectedPlayerId(pick.player_id)} className={`group relative w-[132px] shrink-0 rounded-[6px] border px-2.5 py-2 ${pick?'cursor-pointer':''} ${isCurrent?'border-[#c9f958]/40 bg-[#c9f958]/10':'border-white/[.055] bg-white/[.018]'}`}><div className="flex items-center justify-between text-[8px] uppercase tracking-[.08em] text-[#687063]"><span>R{round} · {overall}</span>{pick&&<button aria-label={`Remove ${pick.player.name}`} onClick={(event)=>{event.stopPropagation();remove.mutate(overall)}} className="text-transparent group-hover:text-[#78847e]">×</button>}</div><p className={`mt-1 truncate text-[10px] ${pick?'font-medium text-[#d5dbcf]':'text-[#7d8578]'}`}>{pick?.player.name||teamById.get(teamId)?.name}</p><p className="mt-0.5 truncate text-[8px] text-[#5f675c]">{teamById.get(teamId)?.name}</p></div>})}</div>
    </section>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(520px,1fr)_minmax(460px,.85fr)]">
      <section className="order-2 flex min-h-0 flex-col border-l border-white/[.06]"><DraftCopilot thread={state.thread} season={session.season}/></section>
      <aside className="order-1 flex min-h-0 flex-col">
        <div className="flex h-11 shrink-0 items-end gap-4 border-b border-white/[.06] px-4"><button onClick={()=>setWorkspaceTab('players')} className={`h-full border-b px-1 text-[10px] font-semibold uppercase tracking-[.1em] ${workspaceTab==='players'?'border-[#c9f958] text-[#c9f958]':'border-transparent text-[#687063]'}`}>Players</button><button onClick={()=>setWorkspaceTab('rosters')} className={`h-full border-b px-1 text-[10px] font-semibold uppercase tracking-[.1em] ${workspaceTab==='rosters'?'border-[#c9f958] text-[#c9f958]':'border-transparent text-[#687063]'}`}>Rosters</button></div>
        {workspaceTab==='players'?<main className="flex min-h-0 flex-1 flex-col"><div className="shrink-0 border-b border-white/[.06] p-3"><div className="flex flex-wrap gap-2"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search available players" className="h-9 min-w-[180px] flex-1 rounded-[6px] border border-white/[.07] bg-white/[.025] px-3 text-xs text-white"/><div className="flex gap-1">{['ALL','QB','RB','WR','TE'].map((pos)=><button key={pos} onClick={()=>setPosition(pos)} className={`rounded-[5px] px-2 text-[10px] ${position===pos?'bg-[#c9f958] text-[#15200b]':'text-[#78847e] hover:bg-white/[.04]'}`}>{pos}</button>)}</div></div></div><div className="min-h-0 overflow-y-auto"><div className="grid grid-cols-[38px_minmax(0,1fr)_42px_64px_52px] border-b border-white/[.05] px-3 py-2 text-[9px] uppercase tracking-[.08em] text-[#687063]"><span>OVR</span><span>Player</span><span>Pos</span><span>Proj</span><span></span></div>{available.slice(0,300).map((player)=>{const rank=rankByPlayer.get(player.id);return <div key={player.id} onClick={()=>setSelectedPlayerId(player.id)} className="grid cursor-pointer grid-cols-[38px_minmax(0,1fr)_42px_64px_52px] items-center border-b border-white/[.045] px-3 py-2.5 text-xs hover:bg-white/[.035]"><span className="font-mono text-[10px] text-[#9fa79a]">{rank?.overall?.toFixed(1)||'—'}</span><span className="truncate font-medium text-[#dce1d6]">{player.name} <span className="text-[9px] font-normal text-[#687063]">{player.nfl_team}</span></span><span className="text-[10px] text-[#9fa79a]">{player.position}{rank?.position?` ${rank.position.toFixed(1)}`:''}</span><span className="font-mono text-[10px] text-[#9fa79a]">{player.projected_total_points?.toFixed(1)||'—'}</span><button disabled={session.status==='completed'||mutate.isPending} onClick={(event)=>{event.stopPropagation();mutate.mutate({playerId:player.id,overall:session.current_overall_pick})}} className="h-7 rounded-[5px] bg-[#c9f958]/10 text-[10px] font-semibold text-[#b8e65b] hover:bg-[#c9f958]/15 disabled:opacity-30">Draft</button></div>})}</div></main>:<div className="flex min-h-0 flex-1 flex-col"><div className="border-b border-white/[.06] p-3"><select value={rosterTeamId} onChange={(event)=>setRosterTeamId(event.target.value)} className="h-9 w-full rounded-[6px] border border-white/[.08] bg-white/[.03] px-3 text-xs text-[#cbd1c5]">{teams.data?.map((team)=><option key={team.id} value={team.id}>{team.name}{team.id===session.selected_team_id?' · Your team':''}</option>)}</select></div><div className="min-h-0 overflow-y-auto">{rosterPicks.map((pick)=><button key={pick.id} onClick={()=>setSelectedPlayerId(pick.player_id)} className="flex w-full items-center gap-3 border-b border-white/[.045] px-4 py-3 text-left text-xs hover:bg-white/[.03]"><span className="w-7 font-mono text-[9px] text-[#687063]">{pick.overall_pick}</span><span className="flex-1 text-[#c8cec2]">{pick.player.name}</span><span className="text-[10px] text-[#687063]">{pick.player.position}</span></button>)}{!rosterPicks.length&&<p className="p-5 text-xs text-[#687063]">No players drafted by this team yet.</p>}</div></div>}
      </aside>
    </div>
    {selectedPlayerId && <PlayerDetailModal playerId={selectedPlayerId} onClose={()=>setSelectedPlayerId(null)}/>}
  </div>
}

function PlayerDetailModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div role="dialog" aria-modal="true" aria-label="Player details" onMouseDown={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6">
    <div onMouseDown={(event)=>event.stopPropagation()} className="relative max-h-[92dvh] w-full max-w-5xl overflow-y-auto rounded-[10px] border border-white/[.1] bg-[#0c0e0b] px-4 pb-6 shadow-2xl sm:px-6">
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-white/[.07] bg-[#0c0e0b]/95 backdrop-blur">
        <span className="text-[10px] uppercase tracking-[.12em] text-[#687063]">Player profile</span>
        <button onClick={onClose} aria-label="Close player details" className="grid size-7 place-items-center rounded-[5px] text-lg text-[#7d8578] hover:bg-white/[.05] hover:text-white">×</button>
      </div>
      <PlayerProfile playerId={playerId}/>
    </div>
  </div>
}
