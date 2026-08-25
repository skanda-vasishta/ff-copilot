"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useActiveScope } from "@/lib/scope";

type Roster = { snapshot: { fetched_at: string } | null; players: Array<{ lineup_slot: string | null; player: { id: string; name: string; position: string | null; nfl_team: string | null } }> };
type Team = { id: string; name: string; wins: number | null; losses: number | null; ties: number | null; standing: number | null };

export function TeamDashboard() {
  const { scope, isLoading } = useActiveScope();
  const roster = useQuery({ queryKey: ["team-roster", scope?.team.id], queryFn: () => api<Roster>(`/v1/teams/${scope!.team.id}/roster`), enabled: Boolean(scope) });
  const standings = useQuery({ queryKey: ["league-teams", scope?.team.league_id], queryFn: () => api<Team[]>(`/v1/leagues/${scope!.team.league_id}/teams`), enabled: Boolean(scope) });
  if (isLoading) return <div className="mx-auto max-w-[1120px] p-8 text-sm text-[#8a9280]">Loading your workspace…</div>;
  if (!scope) return <div className="mx-auto max-w-xl px-5 py-24 text-center"><span className="mx-auto grid size-12 place-items-center rounded-[8px] bg-[#b7f34a]/10 text-xl text-[#b7f34a]">⚙</span><h1 className="mt-5 text-2xl font-semibold text-white">Add your first team</h1><p className="mt-3 text-sm leading-6 text-[#78847e]">Connect an ESPN league and add a team to this workspace.</p><Link href="/settings" className="focus-ring mt-5 inline-flex h-9 items-center rounded-[6px] bg-[#c9f958] px-4 text-xs font-semibold text-[#11170a]">Open settings</Link></div>;
  const me = standings.data?.find((team) => team.id === scope.team.id);
  return <div className="mx-auto max-w-[1120px] px-4 py-7 sm:px-6 lg:px-8">
    <header className="rounded-[18px] border border-white/[.08] bg-[#181a16]/60 px-5 py-4 backdrop-blur-xl sm:px-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#9dbe4e]">{scope.team.league.name || "ESPN league"} · {scope.team.league.season}</p><h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.03em] text-[#eef1e9]">{scope.team.name}</h1></div><div className="flex gap-6 text-sm"><Stat label="Record" value={me ? `${me.wins || 0}-${me.losses || 0}${me.ties ? `-${me.ties}` : ""}` : "—"} /><Stat label="Standing" value={me?.standing ? `#${me.standing}` : "Preseason"} /><Stat label="Scoring" value={scope.team.league.scoring_format_label?.replace("_", " ") || "Custom"} /></div></div></header>
    <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <section className="overflow-hidden rounded-[14px] border border-white/[.06] bg-white/[.022]"><div className="flex items-end justify-between border-b border-white/[.06] px-4 py-3.5 sm:px-5"><div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">Roster</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">Your players</h2></div>{roster.data?.snapshot && <p className="font-mono text-[10px] text-[#6e7568]">Updated {new Date(roster.data.snapshot.fetched_at).toLocaleString()}</p>}</div>
        {roster.isLoading ? <div className="space-y-2 p-6">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[.025]" />)}</div> : roster.data?.players.length ? <div className="divide-y divide-white/[.055]">{roster.data.players.map((row) => <Link key={row.player.id} href={`/player-lookup/${row.player.id}`} className="focus-ring flex items-center justify-between px-5 py-4 transition hover:bg-white/[.025] sm:px-6"><div><span className="font-medium text-white">{row.player.name}</span><span className="ml-2 text-xs text-[#65716b]">{row.player.position || "—"} · {row.player.nfl_team || "FA"}</span></div><span className="text-xs text-[#78847e]">{row.lineup_slot || "Roster"} →</span></Link>)}</div> : <div className="px-6 py-20 text-center"><h3 className="font-medium text-white">No roster yet</h3><p className="mt-2 text-sm text-[#78847e]">Your roster will appear after the draft.</p></div>}
      </section>
      <aside className="overflow-hidden rounded-[14px] border border-white/[.06] bg-white/[.022]"><div className="border-b border-white/[.06] px-4 py-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">League</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">Standings</h2></div><div className="divide-y divide-white/[.045]">{standings.data?.sort((a,b) => Number(a.standing || 999)-Number(b.standing || 999)).map((team) => <div key={team.id} className={`flex items-center gap-3 px-4 py-3 text-[13px] ${team.id === scope.team.id ? "bg-[#c9f958]/[.065] text-[#d6fb7a]" : "text-[#9ba394]"}`}><span className="w-5 font-mono text-[11px] text-[#6e7568]">{team.standing || "—"}</span><span className="min-w-0 flex-1 truncate">{team.name}</span><span className="font-mono text-[11px]">{team.wins || 0}-{team.losses || 0}</span></div>)}</div></aside>
    </div>
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-[9px] uppercase tracking-[.09em] text-[#6e7568]">{label}</p><p className="mt-1 font-mono text-[13px] capitalize text-[#eef1e9]">{value}</p></div>; }
