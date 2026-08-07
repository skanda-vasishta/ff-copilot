'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { api, Player } from '@/lib/api'
import { draftStatus, espnDraftUrl, EspnDraftPayload, parseEspnLeagueInput } from '@/lib/espn-draft'

type DraftPlayer = Player & { espn_id: string | null }
type PoolResponse = { items: DraftPlayer[]; total: number }
type DraftConfig = { leagueId: string; season: number }

const STORAGE_KEY = 'ff-copilot:draft-room'
const positions = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'D/ST']
const posTone: Record<string, string> = { QB: 'text-violet-300', RB: 'text-cyan-300', WR: 'text-amber-200', TE: 'text-rose-300', K: 'text-slate-300', 'D/ST': 'text-emerald-300' }

function initials(name: string) { return name.split(/\s+/).map(part => part[0]).slice(0, 2).join('') }

export function DraftRoom() {
  const [config, setConfig] = useState<DraftConfig | null>(null)
  const [leagueInput, setLeagueInput] = useState('')
  const [season, setSeason] = useState(2026)
  const [payload, setPayload] = useState<EspnDraftPayload | null>(null)
  const [feedError, setFeedError] = useState('')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState('ALL')
  const [sort, setSort] = useState<'rank' | 'projection' | 'name'>('rank')
  const [teamId, setTeamId] = useState<number | null>(null)
  const etag = useRef<string | null>(null)

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setConfig(JSON.parse(saved)) } catch { /* ignore malformed local state */ }
  }, [])

  const pool = useQuery({
    queryKey: ['draft-player-pool', config?.season],
    queryFn: () => api<PoolResponse>(`/v1/draft/player-pool?season=${config!.season}`),
    enabled: Boolean(config),
  })

  useEffect(() => {
    if (!config) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(espnDraftUrl(config.leagueId, config.season), { headers: etag.current ? { 'If-None-Match': etag.current } : undefined })
        if (response.status !== 304) {
          if (!response.ok) throw new Error(response.status === 404 ? 'League not found. Confirm it is public and the season is correct.' : `ESPN returned ${response.status}.`)
          etag.current = response.headers.get('etag')
          const next = await response.json() as EspnDraftPayload
          if (!stopped) { setPayload(next); setFeedError(''); setTeamId(current => current ?? next.teams[0]?.id ?? null) }
        }
        if (!stopped) setLastChecked(new Date())
      } catch (error) {
        if (!stopped) setFeedError(error instanceof Error ? error.message : 'Could not reach ESPN.')
      } finally {
        if (!stopped) timer = setTimeout(poll, payload?.draftDetail.inProgress ? 2000 : 5000)
      }
    }
    poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [config, payload?.draftDetail.inProgress])

  const playerByEspnId = useMemo(() => new Map((pool.data?.items || []).filter(p => p.espn_id).map(p => [String(p.espn_id), p])), [pool.data])
  const picks = useMemo(() => [...(payload?.draftDetail.picks || [])].sort((a, b) => a.overallPickNumber - b.overallPickNumber), [payload])
  const completed = useMemo(() => picks.filter(pick => pick.playerId > 0), [picks])
  const currentPick = picks.find(pick => pick.playerId <= 0)
  const draftedIds = useMemo(() => new Set(completed.map(pick => String(pick.playerId))), [completed])
  const teamById = useMemo(() => new Map((payload?.teams || []).map(team => [team.id, team])), [payload])
  const available = useMemo(() => (pool.data?.items || []).filter(player => !player.espn_id || !draftedIds.has(String(player.espn_id))).filter(player => position === 'ALL' || player.position === position).filter(player => player.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'projection' ? (b.projected_total_points ?? -1) - (a.projected_total_points ?? -1) : (a.median_rank ?? 9999) - (b.median_rank ?? 9999)), [pool.data, draftedIds, position, search, sort])
  const selectedTeam = teamId == null ? null : teamById.get(teamId)
  const roster = completed.filter(pick => pick.teamId === teamId)
  const status = payload ? draftStatus(payload) : 'scheduled'

  function initialize(event: FormEvent) {
    event.preventDefault()
    const leagueId = parseEspnLeagueInput(leagueInput)
    if (!leagueId) { setFeedError('Paste a valid ESPN league URL or numeric league ID.'); return }
    const next = { leagueId, season }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setPayload(null); setFeedError(''); etag.current = null; setConfig(next)
  }
  function reset() { localStorage.removeItem(STORAGE_KEY); setConfig(null); setPayload(null); setFeedError(''); etag.current = null }

  if (!config) return <section className="relative min-h-[72vh] overflow-hidden rounded-[28px] border border-white/[.08] bg-[#090d10] p-6 sm:p-10 lg:p-16">
    <div className="grid-fade absolute inset-0 opacity-80" /><div className="absolute right-[-9rem] top-[-9rem] size-[28rem] rounded-full border border-[#b7f34a]/10 shadow-[0_0_120px_rgba(183,243,74,.08)]" />
    <div className="relative max-w-3xl"><p className="font-mono text-xs font-bold uppercase tracking-[.3em] text-[#b7f34a]">FF-26 / Live operations</p><h1 className="mt-5 text-5xl font-black uppercase leading-[.9] tracking-[-.055em] text-white sm:text-7xl">Draft<br/><span className="text-[#b7f34a]">Room</span></h1><p className="mt-7 max-w-xl text-base leading-7 text-[#97a39d]">Connect a public ESPN league to turn its live draft feed into a scouting board. Picks, remaining players, and every team&apos;s roster update automatically.</p>
      <form onSubmit={initialize} className="panel mt-10 rounded-2xl p-3 sm:flex sm:gap-3"><label className="block flex-1"><span className="sr-only">ESPN league URL or ID</span><input autoFocus value={leagueInput} onChange={e => setLeagueInput(e.target.value)} placeholder="Paste ESPN league URL or ID" className="focus-ring w-full rounded-xl border border-white/[.08] bg-black/30 px-4 py-4 text-sm text-white placeholder:text-[#59635e]" /></label><label className="mt-2 block sm:mt-0"><span className="sr-only">Season</span><input type="number" min="2020" max="2035" value={season} onChange={e => setSeason(Number(e.target.value))} className="focus-ring w-full rounded-xl border border-white/[.08] bg-black/30 px-4 py-4 font-mono text-sm text-white sm:w-28" /></label><button className="focus-ring mt-2 w-full rounded-xl bg-[#b7f34a] px-6 py-4 text-xs font-black uppercase tracking-[.16em] text-[#10140a] transition hover:bg-[#c9fa70] sm:mt-0 sm:w-auto">Enter room →</button></form>
      {feedError && <p role="alert" className="mt-3 text-sm text-red-300">{feedError}</p>}<p className="mt-4 text-xs text-[#637069]">The league must be public. No ESPN password or account connection is required.</p>
    </div>
  </section>

  return <div className="space-y-5">
    <header className="relative overflow-hidden rounded-2xl border border-white/[.08] bg-[#0c1114] p-5"><div className="grid-fade pointer-events-none absolute inset-0 opacity-50"/><div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="flex items-center gap-3"><span className={`size-2 rounded-full ${feedError ? 'bg-red-400' : 'animate-pulse bg-[#b7f34a]'}`}/><p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#78847e]">ESPN feed · {feedError ? 'reconnecting' : 'connected'}</p></div><h1 className="mt-3 text-3xl font-black uppercase tracking-[-.035em] text-white">{payload?.settings.name || `League ${config.leagueId}`}</h1><p className="mt-1 font-mono text-xs text-[#78847e]">{config.season} · League {config.leagueId} · checked {lastChecked?.toLocaleTimeString() || '—'}</p></div><div className="flex flex-wrap items-center gap-2"><Stat label="Status" value={status}/><Stat label="Picks" value={`${completed.length}/${picks.length || '—'}`}/><Stat label="Clock" value={payload?.settings.draftSettings.timePerSelection ? `${payload.settings.draftSettings.timePerSelection}s` : '—'}/><button onClick={reset} className="focus-ring rounded-lg border border-white/[.1] px-3 py-3 text-xs text-[#8c9992] hover:text-white">Change league</button></div></div>{feedError && <p role="alert" className="relative mt-4 rounded-lg border border-red-400/20 bg-red-400/[.06] px-3 py-2 text-xs text-red-200">{feedError} Keeping the last valid board visible.</p>}</header>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0 space-y-5">
        <section className="panel overflow-hidden rounded-2xl"><SectionHead kicker="Command board" title="Draft board" note={currentPick ? `On the clock: #${currentPick.overallPickNumber} · ${teamById.get(currentPick.teamId)?.abbrev || `Team ${currentPick.teamId}`}` : 'Waiting for ESPN draft order'} /><div className="max-h-[520px] overflow-auto p-4"><div className="grid min-w-[720px] gap-2" style={{gridTemplateColumns: `repeat(${Math.max(1, payload?.teams.length || 10)}, minmax(112px, 1fr))`}}>{picks.map(pick => { const player = playerByEspnId.get(String(pick.playerId)); const team = teamById.get(pick.teamId); const active = pick.id === currentPick?.id && status === 'live'; return <div key={`${pick.overallPickNumber}-${pick.teamId}`} className={`min-h-24 rounded-lg border p-2.5 ${active ? 'border-[#b7f34a] bg-[#b7f34a]/10 shadow-[0_0_22px_rgba(183,243,74,.08)]' : pick.playerId > 0 ? 'border-white/[.08] bg-white/[.035]' : 'border-dashed border-white/[.07] bg-black/10'}`}><div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-[#65716b]"><span>{pick.roundId}.{pick.roundPickNumber}</span><span>{team?.abbrev || pick.teamId}</span></div>{pick.playerId > 0 ? <><p className="mt-3 truncate text-xs font-bold text-white" title={player?.name}>{player?.name || `ESPN #${pick.playerId}`}</p><p className={`mt-1 font-mono text-[10px] ${posTone[player?.position || ''] || 'text-[#78847e]'}`}>{player?.position || 'PLAYER'} · {player?.nfl_team || '—'}</p></> : <p className={`mt-5 text-[10px] font-bold uppercase tracking-[.16em] ${active ? 'text-[#c8f775]' : 'text-[#46514b]'}`}>{active ? 'On clock' : 'Open'}</p>}</div>})}</div>{!picks.length && <Empty text="Draft order has not been published by ESPN yet." />}</div></section>

        <section className="panel overflow-hidden rounded-2xl"><SectionHead kicker="Scouting pool" title={`${available.length} available players`} note="Rank is the median across stored sources—not ESPN only."/><div className="flex flex-col gap-2 border-b border-white/[.07] p-3 md:flex-row"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search the board…" className="focus-ring min-w-0 flex-1 rounded-lg border border-white/[.08] bg-black/20 px-3 py-2.5 text-sm text-white"/><div className="flex gap-1 overflow-x-auto">{positions.map(pos => <button key={pos} onClick={() => setPosition(pos)} className={`focus-ring rounded-lg px-2.5 py-2 text-[10px] font-bold ${position === pos ? 'bg-[#b7f34a] text-black' : 'bg-white/[.04] text-[#8c9992]'}`}>{pos}</button>)}</div><select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="focus-ring rounded-lg border border-white/[.08] bg-[#0a0e10] px-3 py-2 text-xs text-white"><option value="rank">Median rank</option><option value="projection">Projection</option><option value="name">Name</option></select></div><div className="max-h-[620px] overflow-auto"><table className="w-full min-w-[650px] text-left"><thead className="sticky top-0 bg-[#101519] text-[9px] uppercase tracking-[.16em] text-[#65716b]"><tr><th className="px-4 py-3">Player</th><th>Pos</th><th>Team</th><th className="text-right">Median rank</th><th className="px-4 text-right">Projection</th></tr></thead><tbody className="divide-y divide-white/[.055]">{available.map(player => <tr key={player.id} className="hover:bg-white/[.025]"><td className="px-4 py-3"><Link href={`/player-lookup/${player.id}`} className="font-medium text-white hover:text-[#b7f34a]">{player.name}</Link>{player.injury_status && <span className="ml-2 text-[9px] text-amber-300">{player.injury_status}</span>}</td><td className={`font-mono text-xs ${posTone[player.position || ''] || 'text-[#8c9992]'}`}>{player.position || '—'}</td><td className="font-mono text-xs text-[#78847e]">{player.nfl_team || 'FA'}</td><td className="text-right font-mono text-sm text-white">{player.median_rank?.toFixed(1) || '—'}<span className="ml-1 text-[9px] text-[#59635e]">{player.source_count ? `${player.source_count}s` : ''}</span></td><td className="px-4 text-right font-mono text-sm text-white">{player.projected_total_points?.toFixed(1) || '—'}</td></tr>)}</tbody></table>{pool.isLoading && <Empty text="Loading centralized player data…"/>}{pool.error && <Empty text={`Player pool unavailable: ${pool.error.message}`}/>}</div></section>
      </main>

      <aside className="space-y-5"><section className="panel overflow-hidden rounded-2xl"><SectionHead kicker="League room" title="Team rosters"/><div className="flex gap-2 overflow-x-auto border-b border-white/[.07] p-3 xl:grid xl:grid-cols-2">{payload?.teams.map(team => <button key={team.id} onClick={() => setTeamId(team.id)} className={`focus-ring flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left ${teamId === team.id ? 'border-[#b7f34a]/50 bg-[#b7f34a]/10 text-white' : 'border-white/[.07] bg-black/10 text-[#89958f]'}`}><span className="grid size-7 shrink-0 place-items-center rounded bg-white/[.06] text-[9px] font-black">{team.abbrev || initials(team.name)}</span><span className="max-w-24 truncate text-[10px] font-bold">{team.name}</span></button>)}</div><div className="p-4"><p className="text-sm font-bold text-white">{selectedTeam?.name || 'Select a team'}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[#65716b]">{roster.length} selections</p><div className="mt-4 space-y-1">{roster.map(pick => { const player = playerByEspnId.get(String(pick.playerId)); return <div key={pick.id} className="flex items-center gap-3 rounded-lg border border-white/[.055] bg-black/10 p-2.5"><span className="w-6 font-mono text-[9px] text-[#59635e]">{pick.roundId}.{pick.roundPickNumber}</span><span className={`w-8 font-mono text-[10px] font-bold ${posTone[player?.position || ''] || 'text-[#8c9992]'}`}>{player?.position || '—'}</span>{player ? <Link href={`/player-lookup/${player.id}`} className="min-w-0 truncate text-xs font-medium text-white hover:text-[#b7f34a]">{player.name}</Link> : <span className="truncate text-xs text-white">ESPN #{pick.playerId}</span>}</div>})}{!roster.length && <Empty text={status === 'scheduled' ? 'No picks yet. The roster will fill live.' : 'This team has not selected yet.'}/>}</div></div></section>
        <section className="panel rounded-2xl p-4"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#65716b]">Recent tape</p><div className="mt-3 space-y-2">{completed.slice(-6).reverse().map(pick => { const player = playerByEspnId.get(String(pick.playerId)); return <div key={pick.id} className="flex items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate text-[#bdc6c1]">{player?.name || `ESPN #${pick.playerId}`}</span><span className="shrink-0 font-mono text-[9px] text-[#65716b]">#{pick.overallPickNumber} {teamById.get(pick.teamId)?.abbrev}</span></div>})}{!completed.length && <p className="text-xs leading-5 text-[#65716b]">Selections will appear here as ESPN records them.</p>}</div></section>
      </aside>
    </div>
  </div>
}

function Stat({label, value}: {label: string; value: string}) { return <div className="rounded-lg border border-white/[.08] bg-black/20 px-3 py-2"><p className="font-mono text-[8px] uppercase tracking-[.16em] text-[#65716b]">{label}</p><p className="mt-1 text-xs font-bold uppercase text-white">{value}</p></div> }
function SectionHead({kicker, title, note}: {kicker: string; title: string; note?: string}) { return <div className="flex flex-col justify-between gap-2 border-b border-white/[.07] bg-black/10 px-4 py-4 sm:flex-row sm:items-end"><div><p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#b7f34a]">{kicker}</p><h2 className="mt-1 text-lg font-black uppercase tracking-[-.02em] text-white">{title}</h2></div>{note && <p className="max-w-sm text-[10px] leading-4 text-[#6e7a74]">{note}</p>}</div> }
function Empty({text}: {text: string}) { return <div className="px-4 py-8 text-center text-xs leading-5 text-[#65716b]">{text}</div> }
