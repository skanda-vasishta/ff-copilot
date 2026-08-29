'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useActiveScope } from '@/lib/scope'
import { createClient } from '@/lib/supabase/client'
import { createDraftSession, getDraftState, listDraftSessions, recordDraftPick, removeDraftPick, renameDraftSession } from './client'
import type { DraftPlayer, DraftSession, DraftTeam } from './types'
import { DraftCopilot } from './DraftCopilot'
import { PlayerDetailModal } from '@/components/features/players/PlayerDetailModal'

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
    {state.isLoading ? <p className="p-8 text-sm text-[#78847e]">Loading draft…</p> : state.data ? <ActiveDraft state={state.data} leagueExternalId={scope.team.league.external_id} onChanged={() => client.invalidateQueries({ queryKey: ['draft-state', sessionId] })} /> : null}
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
    <header className="flex flex-col justify-between gap-5 border-b border-white/[.07] pb-7 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#8daa48]">{leagueName} · {season}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] text-white">Drafts</h1><p className="mt-2 text-sm text-[#747c70]">Resume a draft or start a new manual run.</p></div><div className="flex items-center gap-2"><a href="/draft/espn-bridge" className="inline-flex h-9 items-center rounded-[6px] border border-white/[.09] px-3 text-xs text-[#aeb6aa] hover:bg-white/[.03] hover:text-white">ESPN live setup</a><button onClick={onCreate} className="h-9 rounded-[6px] bg-[#c9f958] px-4 text-xs font-semibold text-[#13190d]">New draft</button></div></header>
    {renameError&&<p className="mt-4 text-xs text-red-300">{renameError}</p>}
    {loading?<div className="mt-6 grid gap-3 sm:grid-cols-2">{[0,1,2,3].map((item)=><div key={item} className="h-36 animate-pulse rounded-[8px] border border-white/[.05] bg-white/[.02]"/>)}</div>:sessions.length?<div className="mt-6 grid gap-3 sm:grid-cols-2">{sessions.map((session)=>{const total=session.team_order.length*session.round_count,completed=Math.min(session.current_overall_pick-1,total),progress=total?Math.round(completed/total*100):0,isRenaming=renamingId===session.id;return <div key={session.id} onClick={()=>!isRenaming&&onOpen(session.id)} className="group cursor-pointer rounded-[8px] border border-white/[.07] bg-white/[.018] p-5 text-left transition hover:border-white/[.13] hover:bg-white/[.028]"><div className="flex items-start justify-between gap-4"><div className="min-w-0 flex-1">{isRenaming?<div className="flex gap-2" onClick={(event)=>event.stopPropagation()}><input autoFocus value={renameValue} onChange={(event)=>setRenameValue(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')saveRename(session);if(event.key==='Escape')setRenamingId(null)}} className="h-8 min-w-0 flex-1 rounded-[5px] border border-white/[.1] bg-black/20 px-2 text-xs text-white"/><button onClick={()=>saveRename(session)} className="rounded-[5px] bg-[#c9f958] px-2 text-[10px] font-semibold text-[#13190d]">Save</button><button onClick={()=>setRenamingId(null)} className="px-1 text-[10px] text-[#737b70]">Cancel</button></div>:<div className="flex items-center gap-2"><h2 className="truncate text-base font-semibold text-[#dce1d6] group-hover:text-white">{session.name}</h2><button aria-label={`Rename ${session.name}`} onClick={(event)=>{event.stopPropagation();setRenameError('');setRenamingId(session.id);setRenameValue(session.name)}} className="rounded-[4px] px-1.5 py-1 text-[10px] text-[#697166] opacity-0 hover:bg-white/[.05] hover:text-white group-hover:opacity-100">Rename</button></div>}<p className="mt-1 text-[10px] uppercase tracking-[.1em] text-[#697166]">{session.draft_type} · {session.team_order.length} teams · {session.round_count} rounds</p></div><span className={`rounded-[5px] px-2 py-1 text-[9px] font-medium uppercase tracking-[.08em] ${session.status==='completed'?'bg-white/[.05] text-[#879087]':'bg-[#c9f958]/10 text-[#b8e65b]'}`}>{session.status}</span></div><div className="mt-7"><div className="flex justify-between text-[10px] text-[#697166]"><span>{completed} of {total} picks</span><span>{progress}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[.05]"><div className="h-full bg-[#a9d64d]" style={{width:`${progress}%`}}/></div></div><div className="mt-4 flex items-center justify-between text-[10px] text-[#596158]"><span>Updated {new Date(session.updated_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span><span className="text-[#8b9487] group-hover:text-[#b8e65b]">Open →</span></div></div>})}</div>:<div className="mt-16 text-center"><p className="text-sm font-medium text-[#d2d7cc]">No draft runs yet</p><p className="mt-1 text-xs text-[#697166]">Create one to set the order and begin entering picks.</p><button onClick={onCreate} className="mt-5 h-9 rounded-[6px] border border-white/[.09] px-4 text-xs text-[#bdc4b9] hover:bg-white/[.03]">Create your first draft</button></div>}
  </main>
}

function DraftSetup({ scope, onCreated, onCancel }: { scope: NonNullable<ReturnType<typeof useActiveScope>['scope']>; onCreated: (id: string) => void; onCancel?: () => void }) {
  const [mode, setMode] = useState<'manual' | 'espn_live'>('manual')
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
  if (mode === 'espn_live') return <EspnDraftSetup scope={scope} onCreated={onCreated} onManual={() => setMode('manual')} onCancel={onCancel}/>
  return <div className="mx-auto w-full max-w-[760px] px-5 py-10"><div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[.14em] text-[#8daa48]">Manual draft</p><h1 className="mt-2 text-2xl font-semibold text-white">Create draft workspace</h1></div>{onCancel && <button onClick={onCancel} className="text-xs text-[#78847e]">Cancel</button>}</div>
    <div className="mt-6 flex border-b border-white/[.07]"><button onClick={() => setMode('manual')} className="border-b border-[#c9f958] px-3 py-2 text-xs text-white">Manual</button><button onClick={() => setMode('espn_live')} className="border-b border-transparent px-3 py-2 text-xs text-[#78847e] hover:text-white">ESPN Live</button></div>
    <form onSubmit={submit} className="mt-7 grid gap-5 rounded-[10px] border border-white/[.07] bg-white/[.02] p-5">
      <div className="grid gap-4 sm:grid-cols-3"><label className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-9 w-full rounded-[6px] border border-white/[.08] bg-black/15 px-3 text-xs normal-case tracking-normal text-white"/></label><label className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Type<select value={draftType} onChange={(e) => setDraftType(e.target.value as 'snake' | 'linear')} className="mt-1.5 h-9 w-full rounded-[6px] border border-white/[.08] bg-black/15 px-3 text-xs normal-case tracking-normal text-white"><option value="snake">Snake</option><option value="linear">Linear</option></select></label><label className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Rounds<input type="number" min={1} max={40} value={roundCount} onChange={(e) => setRoundCount(Number(e.target.value))} className="mt-1.5 h-9 w-full rounded-[6px] border border-white/[.08] bg-black/15 px-3 text-xs normal-case tracking-normal text-white"/></label></div>
      <div><div className="flex items-center justify-between"><p className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Draft order</p><p className="text-[10px] text-[#687063]">Imported from ESPN when available</p></div><div className="mt-2 divide-y divide-white/[.055] rounded-[7px] border border-white/[.07]">{order.map((id, index) => <div key={id} className="flex h-9 items-center gap-3 px-3 text-xs"><span className="w-5 font-mono text-[10px] text-[#687063]">{index + 1}</span><span className="flex-1 text-[#c8cec2]">{byId.get(id)?.name || id}{id === scope.team.id ? ' (your team)' : ''}</span><button type="button" onClick={() => move(index,-1)} className="text-[#687063] hover:text-white">↑</button><button type="button" onClick={() => move(index,1)} className="text-[#687063] hover:text-white">↓</button></div>)}</div></div>
      {error && <p className="text-xs text-red-300">{error}</p>}<button disabled={order.length < 2} className="h-9 rounded-[6px] bg-[#c9f958] text-xs font-semibold text-[#13190d] disabled:opacity-30">Create draft</button>
    </form>
  </div>
}

type EspnDraftPreview = {
  id: number
  seasonId: number
  settings: { name?: string; draftSettings: { type: string; pickOrder: number[] } }
  draftDetail: { picks: Array<{ id: number; teamId: number }>; inProgress: boolean; drafted: boolean }
  teams: Array<{ id: number; name: string; abbrev?: string | null }>
}

type EspnBridgeConfig = { leagueId: string; seasonId: number; leagueName: string | null; draftType: string; pickOrder: number[]; roundCount: number; teams: Array<{ id: number; name: string; abbrev?: string | null }> }

function previewFromBridge(config: EspnBridgeConfig): EspnDraftPreview {
  return { id: Number(config.leagueId), seasonId: config.seasonId, settings: { name: config.leagueName || undefined, draftSettings: { type: config.draftType, pickOrder: config.pickOrder } }, draftDetail: { picks: Array.from({ length: config.roundCount * config.teams.length }, (_, id) => ({ id, teamId: 0 })), inProgress: true, drafted: false }, teams: config.teams }
}

function EspnDraftSetup({ scope, onCreated, onManual, onCancel }: { scope: NonNullable<ReturnType<typeof useActiveScope>['scope']>; onCreated: (id: string) => void; onManual: () => void; onCancel?: () => void }) {
  const [draftUrl, setDraftUrl] = useState('')
  const [preview, setPreview] = useState<EspnDraftPreview | null>(null)
  const [teamId, setTeamId] = useState('')
  const [name, setName] = useState(`${scope.team.league.season} ESPN Draft`)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function inspect() {
    setError(''); setLoading(true)
    try {
      const url = new URL(draftUrl)
      const leagueId = url.searchParams.get('leagueId'), season = Number(url.searchParams.get('seasonId') || scope.team.league.season)
      const selectedTeam = url.searchParams.get('teamId') || ''
      if (!leagueId || !/^\d+$/.test(leagueId)) throw new Error('Paste a valid ESPN draft URL')
      const endpoint = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`)
      endpoint.searchParams.append('view', 'mDraftDetail'); endpoint.searchParams.append('view', 'mSettings'); endpoint.searchParams.append('view', 'mTeam'); endpoint.searchParams.set('_ffPoll', String(Date.now()))
      const response = await fetch(endpoint, { cache: 'no-store' })
      let data: EspnDraftPreview
      if (response.ok) data = await response.json() as EspnDraftPreview
      else data = await new Promise<EspnDraftPreview>((resolve, reject) => {
        const timer = window.setTimeout(() => { window.removeEventListener('ff-copilot:draft-bridge-state', receive); reject(new Error('Open this draft in ESPN with the bridge extension enabled, then try again')) }, 3500)
        const receive = (event: Event) => {
          const state = (event as CustomEvent<{ config?: EspnBridgeConfig | null }>).detail
          if (!state?.config) return
          window.clearTimeout(timer); window.removeEventListener('ff-copilot:draft-bridge-state', receive); resolve(previewFromBridge(state.config))
        }
        window.addEventListener('ff-copilot:draft-bridge-state', receive)
        window.dispatchEvent(new CustomEvent('ff-copilot:draft-bridge-request', { detail: { leagueId } }))
      })
      if (!data.teams?.length || !data.settings?.draftSettings?.pickOrder?.length) throw new Error('ESPN did not return teams and a draft order')
      setPreview(data); setTeamId(selectedTeam || String(data.settings.draftSettings.pickOrder[0])); setName(`${season} ${data.settings.name || 'ESPN Draft'}`)
    } catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Could not inspect ESPN draft') }
    finally { setLoading(false) }
  }
  async function create() {
    if (!preview) return
    setError(''); setLoading(true)
    try {
      const participantIds = new Map(preview.teams.map((team) => [String(team.id), crypto.randomUUID()]))
      const orderedExternalIds = preview.settings.draftSettings.pickOrder.map(String)
      const teamOrder = orderedExternalIds.map((id) => participantIds.get(id)).filter((id): id is string => Boolean(id))
      if (teamOrder.length !== preview.teams.length) throw new Error('ESPN draft order does not match its teams')
      const totalSlots = preview.draftDetail.picks.length
      const roundCount = totalSlots ? Math.ceil(totalSlots / preview.teams.length) : 16
      const session = await createDraftSession({
        leagueId: scope.team.league_id, selectedTeamId: scope.team.id, season: preview.seasonId,
        name, draftType: preview.settings.draftSettings.type === 'SNAKE' ? 'snake' : 'linear',
        teamOrder, roundCount, source: 'espn_live', externalLeagueId: String(preview.id), externalTeamId: teamId,
        participants: orderedExternalIds.map((externalId, index) => {
          const team = preview.teams.find((item) => String(item.id) === externalId)!
          return { id: participantIds.get(externalId)!, externalTeamId: externalId, name: team.name, abbreviation: team.abbrev, draftPosition: index + 1, isUser: externalId === teamId }
        }),
      })
      window.localStorage.setItem(`ff-copilot:espn-draft:${session.id}`, String(preview.id))
      onCreated(session.id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create ESPN draft') }
    finally { setLoading(false) }
  }
  const orderedTeams = preview?.settings.draftSettings.pickOrder.map((id) => preview.teams.find((team) => team.id === id)).filter(Boolean) || []
  return <div className="mx-auto w-full max-w-[760px] px-5 py-10"><div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[.14em] text-[#8daa48]">ESPN Live</p><h1 className="mt-2 text-2xl font-semibold text-white">Connect an ESPN draft</h1></div>{onCancel&&<button onClick={onCancel} className="text-xs text-[#78847e]">Cancel</button>}</div>
    <div className="mt-6 flex border-b border-white/[.07]"><button onClick={onManual} className="border-b border-transparent px-3 py-2 text-xs text-[#78847e] hover:text-white">Manual</button><button className="border-b border-[#c9f958] px-3 py-2 text-xs text-white">ESPN Live</button></div>
    <div className="mt-7 rounded-[10px] border border-white/[.07] bg-white/[.02] p-5"><label className="text-[10px] uppercase tracking-[.1em] text-[#687063]">ESPN draft URL<input value={draftUrl} onChange={(event)=>setDraftUrl(event.target.value)} placeholder="https://fantasy.espn.com/football/draft?leagueId=…" className="mt-2 h-10 w-full rounded-[6px] border border-white/[.08] bg-black/15 px-3 text-xs normal-case tracking-normal text-white"/></label><button disabled={loading||!draftUrl.trim()} onClick={inspect} className="mt-3 h-9 rounded-[6px] border border-white/[.09] px-4 text-xs text-[#bdc4b9] disabled:opacity-30">{loading?'Connecting…':'Load draft'}</button></div>
    {preview&&<div className="mt-4 rounded-[10px] border border-white/[.07] bg-white/[.02] p-5"><div className="grid gap-4 sm:grid-cols-2"><label className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Draft name<input value={name} onChange={(event)=>setName(event.target.value)} className="mt-2 h-9 w-full rounded-[6px] border border-white/[.08] bg-black/15 px-3 text-xs normal-case tracking-normal text-white"/></label><label className="text-[10px] uppercase tracking-[.1em] text-[#687063]">Your draft team<select value={teamId} onChange={(event)=>setTeamId(event.target.value)} className="mt-2 h-9 w-full rounded-[6px] border border-white/[.08] bg-black/15 px-3 text-xs normal-case tracking-normal text-white">{orderedTeams.map((team)=><option key={team!.id} value={team!.id}>{team!.name}</option>)}</select></label></div><div className="mt-5 divide-y divide-white/[.055] border-y border-white/[.06]">{orderedTeams.map((team,index)=><div key={team!.id} className="flex h-9 items-center gap-3 text-xs"><span className="w-6 font-mono text-[10px] text-[#687063]">{index+1}</span><span className="text-[#c8cec2]">{team!.name}</span></div>)}</div><button disabled={loading||!name.trim()||!teamId} onClick={create} className="mt-5 h-9 w-full rounded-[6px] bg-[#c9f958] text-xs font-semibold text-[#13190d] disabled:opacity-30">Create connected draft</button></div>}
    {error&&<p className="mt-4 text-xs text-red-300">{error}</p>}
  </div>
}

type EspnBridgeState = { installed: boolean; connected: boolean; leagueId: string | null; lastFrameAt: string | null; picks: Array<{ overallPickNumber: number; teamId: number; playerId: number }>; config?: EspnBridgeConfig | null }

function espnLeagueId(value: string) {
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  try { return new URL(trimmed).searchParams.get('leagueId') }
  catch { return null }
}

function ActiveDraft({ state, leagueExternalId, onChanged }: { state: Awaited<ReturnType<typeof getDraftState>>; leagueExternalId: string; onChanged: () => void }) {
  const session = state.session
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState('ALL')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [workspaceTab, setWorkspaceTab] = useState<'players' | 'rosters'>('players')
  const [rosterTeamId, setRosterTeamId] = useState(session.selected_team_id)
  const [tickerAway, setTickerAway] = useState(false)
  const [bridgeLeagueId, setBridgeLeagueId] = useState<string | null>(null)
  const [bridgeState, setBridgeState] = useState<EspnBridgeState | null>(null)
  const [bridgeError, setBridgeError] = useState('')
  const bridgeSyncing = useRef(false)
  const importedPicks = useRef(new Set<number>())
  const tickerRef = useRef<HTMLDivElement>(null)
  const currentPickRef = useRef<HTMLDivElement>(null)
  const pool = useQuery({ queryKey: ['draft-player-pool', session.season], queryFn: () => api<{ items: DraftPlayer[] }>(`/v1/draft/player-pool?season=${session.season}`) })
  const teams = useQuery({ queryKey: ['league-teams', session.league_id], queryFn: () => api<DraftTeam[]>(`/v1/leagues/${session.league_id}/teams`), enabled: session.source === 'manual' })
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
  const displayTeams: DraftTeam[] = session.source === 'espn_live'
    ? state.participants.map((participant) => ({ id: participant.id, name: participant.name, external_id: participant.external_team_id }))
    : teams.data || []
  const teamById = new Map(displayTeams.map((team) => [team.id, team]))
  const pickByOverall = new Map(state.picks.map((pick) => [pick.overall_pick, pick]))
  const total = session.team_order.length * session.round_count
  const currentTeam = teamById.get(teamForPick(session.team_order, session.draft_type, Math.min(session.current_overall_pick,total)))
  const rosterPicks = state.picks.filter((pick) => (pick.draft_participant_id || pick.fantasy_team_id) === rosterTeamId)
  const goToLatestPick = () => currentPickRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  const updateTickerPosition = () => {
    const ticker = tickerRef.current, current = currentPickRef.current
    if (!ticker || !current) return
    const tickerBounds = ticker.getBoundingClientRect(), currentBounds = current.getBoundingClientRect()
    setTickerAway(currentBounds.left < tickerBounds.left || currentBounds.right > tickerBounds.right)
  }
  useEffect(() => {
    const saved = window.localStorage.getItem(`ff-copilot:espn-draft:${session.id}`)
    if (saved) setBridgeLeagueId(saved)
    else if (session.source === 'espn_live' && session.external_league_id) setBridgeLeagueId(session.external_league_id)
    if (session.source === 'espn_live') {
      const selected = state.participants.find((participant) => participant.external_team_id === session.external_team_id)
      if (selected) setRosterTeamId(selected.id)
    }
  }, [session.external_league_id, session.external_team_id, session.id, session.source, state.participants])
  useEffect(() => {
    if (!bridgeLeagueId) return
    const receive = (event: Event) => setBridgeState((event as CustomEvent<EspnBridgeState>).detail)
    window.addEventListener('ff-copilot:draft-bridge-state', receive)
    const request = () => window.dispatchEvent(new CustomEvent('ff-copilot:draft-bridge-request', { detail: { leagueId: bridgeLeagueId } }))
    request()
    const timer = window.setInterval(request, 1000)
    return () => { window.clearInterval(timer); window.removeEventListener('ff-copilot:draft-bridge-state', receive) }
  }, [bridgeLeagueId])
  useEffect(() => {
    if (!bridgeState?.connected || !bridgeState.picks.length || !pool.data?.items.length || bridgeSyncing.current) return
    const existing = new Map(state.picks.map((pick) => [pick.overall_pick, pick.player_id]))
    const byEspnId = new Map(pool.data.items.map((player) => [String(player.espn_id), player.id]))
    const pending = bridgeState.picks
      .filter((pick) => Number.isFinite(Number(pick.overallPickNumber)) && Number(pick.overallPickNumber) > 0 && Number.isFinite(Number(pick.playerId)) && Number(pick.playerId) > 0)
      .filter((pick) => !existing.has(Number(pick.overallPickNumber)) && !importedPicks.current.has(Number(pick.overallPickNumber)))
      .sort((a, b) => a.overallPickNumber - b.overallPickNumber)
    if (!pending.length) return
    bridgeSyncing.current = true
    void (async () => {
      let revision = session.revision
      try {
        for (const pick of pending) {
          const playerId = byEspnId.get(String(pick.playerId))
          if (!playerId) throw new Error(`ESPN player ${pick.playerId} is missing from the player dataset`)
          const updated = await recordDraftPick(session.id, playerId, pick.overallPickNumber, revision)
          revision = updated.revision
          importedPicks.current.add(pick.overallPickNumber)
        }
        setBridgeError('')
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : typeof cause === 'object' && cause && 'message' in cause ? String(cause.message) : 'Could not import ESPN picks'
        setBridgeError(message)
      } finally {
        bridgeSyncing.current = false
        onChanged()
      }
    })()
  }, [bridgeState, onChanged, pool.data?.items, session.id, session.revision, state.picks])
  function connectBridge() {
    const input = window.prompt('Paste the ESPN draft link or league ID', bridgeLeagueId || leagueExternalId)
    if (input == null) return
    const id = espnLeagueId(input)
    if (!id) { setBridgeError('Could not find an ESPN league ID in that value'); return }
    window.localStorage.setItem(`ff-copilot:espn-draft:${session.id}`, id)
    setBridgeLeagueId(id)
    setBridgeState(null)
    setBridgeError('')
  }
  useEffect(() => { requestAnimationFrame(goToLatestPick) }, [session.current_overall_pick])
  return <div className="flex min-h-0 flex-1 flex-col">
    <section className="shrink-0 border-b border-white/[.06] bg-white/[.012]">
      <div className="flex items-center justify-between px-4 py-2"><div><p className="text-[9px] uppercase tracking-[.12em] text-[#687063]">On the clock</p><p className="mt-0.5 text-xs font-semibold text-white">Pick {session.current_overall_pick} · {currentTeam?.name || 'Complete'}</p></div><div className="flex items-center gap-3">{tickerAway&&<button onClick={goToLatestPick} className="rounded-[5px] bg-[#c9f958]/10 px-2 py-1 text-[9px] font-medium text-[#b8e65b]">Latest pick →</button>}{session.source==='espn_live'&&<button onClick={connectBridge} className={`rounded-[5px] border px-2 py-1 text-[9px] ${bridgeState?.connected?'border-[#c9f958]/25 text-[#b8e65b]':'border-white/[.08] text-[#7f897b]'}`}>{bridgeState?.connected?`ESPN connected · ${bridgeState.picks.length} picks`:bridgeLeagueId?'Waiting for ESPN bridge':'Connect ESPN'}</button>}<p className="text-[9px] text-[#687063]">Scroll to review · click × to remove</p></div></div>
      {bridgeError&&<p className="px-4 pb-2 text-[10px] text-red-300">{bridgeError}</p>}
      <div ref={tickerRef} onScroll={updateTickerPosition} className="flex gap-1.5 overflow-x-auto px-3 pb-3">{Array.from({length:total},(_,index)=>{const overall=index+1,teamId=teamForPick(session.team_order,session.draft_type,overall),pick=pickByOverall.get(overall),round=Math.floor(index/session.team_order.length)+1,isCurrent=overall===session.current_overall_pick;return <div ref={isCurrent?currentPickRef:undefined} key={overall} onClick={() => pick && setSelectedPlayerId(pick.player_id)} className={`group relative w-[132px] shrink-0 rounded-[6px] border px-2.5 py-2 ${pick?'cursor-pointer':''} ${isCurrent?'border-[#c9f958]/40 bg-[#c9f958]/10':'border-white/[.055] bg-white/[.018]'}`}><div className="flex items-center justify-between text-[8px] uppercase tracking-[.08em] text-[#687063]"><span>R{round} · {overall}</span>{pick&&<button aria-label={`Remove ${pick.player.name}`} onClick={(event)=>{event.stopPropagation();remove.mutate(overall)}} className="text-transparent group-hover:text-[#78847e]">×</button>}</div><p className={`mt-1 truncate text-[10px] ${pick?'font-medium text-[#d5dbcf]':'text-[#7d8578]'}`}>{pick?.player.name||teamById.get(teamId)?.name}</p><p className="mt-0.5 truncate text-[8px] text-[#5f675c]">{teamById.get(teamId)?.name}</p></div>})}</div>
    </section>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(520px,1fr)_minmax(460px,.85fr)]">
      <section className="order-2 flex min-h-0 flex-col border-l border-white/[.06]"><DraftCopilot thread={state.thread} season={session.season}/></section>
      <aside className="order-1 flex min-h-0 flex-col">
        <div className="flex h-11 shrink-0 items-end gap-4 border-b border-white/[.06] px-4"><button onClick={()=>setWorkspaceTab('players')} className={`h-full border-b px-1 text-[10px] font-semibold uppercase tracking-[.1em] ${workspaceTab==='players'?'border-[#c9f958] text-[#c9f958]':'border-transparent text-[#687063]'}`}>Players</button><button onClick={()=>setWorkspaceTab('rosters')} className={`h-full border-b px-1 text-[10px] font-semibold uppercase tracking-[.1em] ${workspaceTab==='rosters'?'border-[#c9f958] text-[#c9f958]':'border-transparent text-[#687063]'}`}>Rosters</button></div>
        {workspaceTab==='players'?<main className="flex min-h-0 flex-1 flex-col"><div className="shrink-0 border-b border-white/[.06] p-3"><div className="flex flex-wrap gap-2"><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search available players" className="h-9 min-w-[180px] flex-1 rounded-[6px] border border-white/[.07] bg-white/[.025] px-3 text-xs text-white"/><div className="flex gap-1">{['ALL','QB','RB','WR','TE'].map((pos)=><button key={pos} onClick={()=>setPosition(pos)} className={`rounded-[5px] px-2 text-[10px] ${position===pos?'bg-[#c9f958] text-[#15200b]':'text-[#78847e] hover:bg-white/[.04]'}`}>{pos}</button>)}</div></div></div><div className="min-h-0 overflow-y-auto"><div className="grid grid-cols-[38px_minmax(0,1fr)_42px_64px_52px] border-b border-white/[.05] px-3 py-2 text-[9px] uppercase tracking-[.08em] text-[#687063]"><span>OVR</span><span>Player</span><span>Pos</span><span>Proj</span><span></span></div>{available.slice(0,300).map((player)=>{const rank=rankByPlayer.get(player.id);return <div key={player.id} onClick={()=>setSelectedPlayerId(player.id)} className="grid cursor-pointer grid-cols-[38px_minmax(0,1fr)_42px_64px_52px] items-center border-b border-white/[.045] px-3 py-2.5 text-xs hover:bg-white/[.035]"><span className="font-mono text-[10px] text-[#9fa79a]">{rank?.overall?.toFixed(1)||'—'}</span><span className="truncate font-medium text-[#dce1d6]">{player.name} <span className="text-[9px] font-normal text-[#687063]">{player.nfl_team}</span></span><span className="text-[10px] text-[#9fa79a]">{player.position}{rank?.position?` ${rank.position.toFixed(1)}`:''}</span><span className="font-mono text-[10px] text-[#9fa79a]">{player.projected_total_points?.toFixed(1)||'—'}</span><button disabled={session.status==='completed'||mutate.isPending} onClick={(event)=>{event.stopPropagation();mutate.mutate({playerId:player.id,overall:session.current_overall_pick})}} className="h-7 rounded-[5px] bg-[#c9f958]/10 text-[10px] font-semibold text-[#b8e65b] hover:bg-[#c9f958]/15 disabled:opacity-30">Draft</button></div>})}</div></main>:<div className="flex min-h-0 flex-1 flex-col"><div className="border-b border-white/[.06] p-3"><select value={rosterTeamId} onChange={(event)=>setRosterTeamId(event.target.value)} className="h-9 w-full rounded-[6px] border border-white/[.08] bg-white/[.03] px-3 text-xs text-[#cbd1c5]">{displayTeams.map((team)=><option key={team.id} value={team.id}>{team.name}{session.source==='espn_live'?state.participants.find((participant)=>participant.id===team.id)?.is_user?' · Your team':'':team.id===session.selected_team_id?' · Your team':''}</option>)}</select></div><div className="min-h-0 overflow-y-auto">{rosterPicks.map((pick)=><button key={pick.id} onClick={()=>setSelectedPlayerId(pick.player_id)} className="flex w-full items-center gap-3 border-b border-white/[.045] px-4 py-3 text-left text-xs hover:bg-white/[.03]"><span className="w-7 font-mono text-[9px] text-[#687063]">{pick.overall_pick}</span><span className="flex-1 text-[#c8cec2]">{pick.player.name}</span><span className="text-[10px] text-[#687063]">{pick.player.position}</span></button>)}{!rosterPicks.length&&<p className="p-5 text-xs text-[#687063]">No players drafted by this team yet.</p>}</div></div>}
      </aside>
    </div>
    {selectedPlayerId && <PlayerDetailModal playerId={selectedPlayerId} onClose={()=>setSelectedPlayerId(null)}/>}
  </div>
}
