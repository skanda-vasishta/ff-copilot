"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useActiveScope } from "@/lib/scope";
import { PlayerDetailModal } from "@/components/features/players/PlayerDetailModal";
import { useRecommendationAgent } from "@/features/recommendations/useRecommendationAgent";
import type { LineupRecommendations } from "@/features/recommendations/schema";

type Roster = { snapshot: { fetched_at: string } | null; players: Array<{ lineup_slot: string | null; player: { id: string; name: string; position: string | null; nfl_team: string | null } }> };
type Team = { id: string; name: string; wins: number | null; losses: number | null; ties: number | null; standing: number | null };
type RosterRow = Roster["players"][number];

const RESERVE_SLOTS = new Set(["BE", "BENCH", "IR", "INJURED RESERVE"]);
const SLOT_ORDER = ["QB", "RB", "WR", "TE", "RB/WR/TE", "FLEX", "OP", "SUPERFLEX", "D/ST", "DST", "K"];

export function TeamDashboard() {
  const { scope, isLoading } = useActiveScope();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const roster = useQuery({ queryKey: ["team-roster", scope?.team.id], queryFn: () => api<Roster>(`/v1/teams/${scope!.team.id}/roster`), enabled: Boolean(scope) });
  const standings = useQuery({ queryKey: ["league-teams", scope?.team.league_id], queryFn: () => api<Team[]>(`/v1/leagues/${scope!.team.league_id}/teams`), enabled: Boolean(scope) });
  const lineupAgent = useRecommendationAgent({ workflow: "lineup", teamId: scope?.team.id, leagueId: scope?.team.league_id, season: scope?.team.league.season, leagueSyncedAt: scope?.team.league.last_synced_at });
  if (isLoading) return <div className="mx-auto max-w-[1120px] p-8 text-sm text-[#8a9280]">Loading your workspace…</div>;
  if (!scope) return <div className="mx-auto max-w-xl px-5 py-24 text-center"><span className="mx-auto grid size-12 place-items-center rounded-[8px] bg-[#b7f34a]/10 text-xl text-[#b7f34a]">⚙</span><h1 className="mt-5 text-2xl font-semibold text-white">Add your first team</h1><p className="mt-3 text-sm leading-6 text-[#78847e]">Connect an ESPN or Sleeper league and add a team to this workspace.</p><Link href="/settings" className="focus-ring mt-5 inline-flex h-9 items-center rounded-[6px] bg-[#c9f958] px-4 text-xs font-semibold text-[#11170a]">Open settings</Link></div>;
  const me = standings.data?.find((team) => team.id === scope.team.id);
  const slots = expandStartingSlots(scope.team.league.lineup_slot_counts || {});
  const currentLineup = assignCurrentLineup(slots, roster.data?.players || []);
  const recommended = lineupAgent.result?.kind === "lineup" ? lineupAgent.result : null;
  const displayedLineup = recommended ? assignRecommendedLineup(slots, recommended, roster.data?.players || []) : currentLineup;
  const assignedIds = new Set(displayedLineup.flatMap((entry) => entry.player ? [entry.player.player.id] : []));
  const bench = (roster.data?.players || []).filter((row) => !assignedIds.has(row.player.id));
  const lineupBusy = lineupAgent.status !== "idle" && lineupAgent.status !== "error";
  return <div className="mx-auto max-w-[1120px] px-4 py-7 sm:px-6 lg:px-8">
    <header className="rounded-[18px] border border-white/[.08] bg-[#181a16]/60 px-5 py-4 backdrop-blur-xl sm:px-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#9dbe4e]">{scope.team.league.name || `${scope.team.league.provider} league`} · {scope.team.league.provider} · {scope.team.league.season}</p><h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.03em] text-[#eef1e9]">{scope.team.name}</h1></div><div className="flex gap-6 text-sm"><Stat label="Record" value={me ? `${me.wins || 0}-${me.losses || 0}${me.ties ? `-${me.ties}` : ""}` : "—"} /><Stat label="Standing" value={me?.standing ? `#${me.standing}` : "Preseason"} /><Stat label="Scoring" value={scope.team.league.scoring_format_label?.replace("_", " ") || "Custom"} /></div></div></header>
    <div className="mt-[18px] grid gap-3 sm:grid-cols-2"><Link href="/free-agents" className="focus-ring rounded-[12px] border border-[#c9f958]/15 bg-[#c9f958]/[.045] px-5 py-4 transition hover:bg-[#c9f958]/[.075]"><p className="text-sm font-semibold text-[#d6fb7a]">Find free agents →</p><p className="mt-1 text-xs text-[#78847e]">Five agent-researched fits at every position</p></Link><Link href="/trade-tool" className="focus-ring rounded-[12px] border border-white/[.07] bg-white/[.025] px-5 py-4 transition hover:bg-white/[.045]"><p className="text-sm font-semibold text-[#eef1e9]">Build trade ideas →</p><p className="mt-1 text-xs text-[#78847e]">Five offers based on every league roster</p></Link></div>
    <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <section className="overflow-hidden rounded-[14px] border border-white/[.06] bg-white/[.022]"><div className="flex items-end justify-between gap-4 border-b border-white/[.06] px-4 py-3.5 sm:px-5"><div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">Roster</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">{recommended ? "Recommended lineup" : "ESPN lineup"}</h2></div><div className="flex items-center gap-3">{roster.data?.snapshot && <p className="hidden font-mono text-[10px] text-[#6e7568] sm:block">Updated {new Date(roster.data.snapshot.fetched_at).toLocaleString()}</p>}<button disabled={lineupBusy || !roster.data?.players.length || !slots.length} onClick={() => void lineupAgent.run("Set my best lineup for the ESPN starting slots. Return only the required structured JSON result.")} className="focus-ring h-8 rounded-[6px] bg-[#c9f958]/10 px-3 text-[10px] font-semibold text-[#c9f958] hover:bg-[#c9f958]/15 disabled:opacity-35">{lineupBusy ? "Optimizing…" : recommended ? "Recalculate" : "Set best lineup"}</button></div></div>
        {lineupAgent.error && <div role="alert" className="border-b border-red-400/15 px-5 py-3 text-xs text-red-200">{lineupAgent.error}</div>}
        {roster.isLoading ? <div className="space-y-2 p-6">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[.025]" />)}</div> : roster.data?.players.length ? <div><div className="divide-y divide-white/[.055]">{displayedLineup.map((entry) => <LineupRow key={`${entry.slot}-${entry.index}`} slot={entry.slot} player={entry.player} reason={entry.reason} onSelect={setSelectedPlayerId} />)}</div>{bench.length > 0 && <><div className="border-y border-white/[.06] bg-black/10 px-5 py-2 text-[9px] font-semibold uppercase tracking-[.12em] text-[#697166]">Bench & reserve</div><div className="divide-y divide-white/[.045]">{bench.map((row) => <LineupRow key={row.player.id} slot={row.lineup_slot || "BE"} player={row} onSelect={setSelectedPlayerId} />)}</div></>}</div> : <div className="px-6 py-20 text-center"><h3 className="font-medium text-white">No roster yet</h3><p className="mt-2 text-sm text-[#78847e]">Your roster will appear after the draft.</p></div>}
      </section>
      <aside className="overflow-hidden rounded-[14px] border border-white/[.06] bg-white/[.022]"><div className="border-b border-white/[.06] px-4 py-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">League</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">Standings</h2></div><div className="divide-y divide-white/[.045]">{standings.data?.sort((a,b) => Number(a.standing || 999)-Number(b.standing || 999)).map((team) => <div key={team.id} className={`flex items-center gap-3 px-4 py-3 text-[13px] ${team.id === scope.team.id ? "bg-[#c9f958]/[.065] text-[#d6fb7a]" : "text-[#9ba394]"}`}><span className="w-5 font-mono text-[11px] text-[#6e7568]">{team.standing || "—"}</span><span className="min-w-0 flex-1 truncate">{team.name}</span><span className="font-mono text-[11px]">{team.wins || 0}-{team.losses || 0}</span></div>)}</div></aside>
    </div>{selectedPlayerId&&<PlayerDetailModal playerId={selectedPlayerId} onClose={()=>setSelectedPlayerId(null)}/>}
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-[9px] uppercase tracking-[.09em] text-[#6e7568]">{label}</p><p className="mt-1 font-mono text-[13px] capitalize text-[#eef1e9]">{value}</p></div>; }

function expandStartingSlots(counts: Record<string, number>) {
  return Object.entries(counts).filter(([slot, count]) => count > 0 && !RESERVE_SLOTS.has(slot.toUpperCase()))
    .sort(([left], [right]) => (SLOT_ORDER.indexOf(left) < 0 ? 999 : SLOT_ORDER.indexOf(left)) - (SLOT_ORDER.indexOf(right) < 0 ? 999 : SLOT_ORDER.indexOf(right)))
    .flatMap(([slot, count]) => Array.from({ length: count }, (_, index) => ({ slot, index: index + 1 })));
}

function assignCurrentLineup(slots: Array<{ slot: string; index: number }>, players: RosterRow[]) {
  const remaining = [...players];
  return slots.map(({ slot, index }) => {
    const playerIndex = remaining.findIndex((row) => row.lineup_slot?.toUpperCase() === slot.toUpperCase());
    const player = playerIndex >= 0 ? remaining.splice(playerIndex, 1)[0] : undefined;
    return { slot, index, player, reason: undefined as string | undefined };
  });
}

function assignRecommendedLineup(slots: Array<{ slot: string; index: number }>, result: LineupRecommendations, players: RosterRow[]) {
  const byId = new Map(players.map((row) => [row.player.id, row]));
  const current = assignCurrentLineup(slots, players);
  return slots.map(({ slot, index }) => {
    const assignment = result.assignments.find((item) => item.slot.toUpperCase() === slot.toUpperCase() && item.slot_index === index);
    return { slot, index, player: assignment ? byId.get(assignment.player_id) : current.find((item) => item.slot === slot && item.index === index)?.player, reason: assignment?.reason };
  });
}

function LineupRow({ slot, player, reason, onSelect }: { slot: string; player?: RosterRow; reason?: string; onSelect: (id: string) => void }) {
  return <button disabled={!player} onClick={() => player && onSelect(player.player.id)} className="focus-ring grid w-full grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 text-left transition hover:bg-white/[.025] disabled:cursor-default sm:px-6"><span className="font-mono text-[10px] font-semibold text-[#9dbe4e]">{slot}</span>{player ? <><div className="min-w-0"><span className="font-medium text-white">{player.player.name}</span><span className="ml-2 text-xs text-[#65716b]">{player.player.position || "—"} · {player.player.nfl_team || "FA"}</span>{reason && <p className="mt-1 truncate text-[10px] text-[#78847e]" title={reason}>{reason}</p>}</div><span className="text-xs text-[#78847e]">→</span></> : <span className="text-xs text-[#5f6659]">Empty slot</span>}</button>;
}
