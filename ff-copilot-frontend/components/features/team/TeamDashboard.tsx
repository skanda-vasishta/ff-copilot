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
  if (isLoading) return <div className="mx-auto max-w-[1440px] p-8 text-sm text-[#78847e]">Loading your workspace…</div>;
  if (!scope) return <div className="mx-auto max-w-xl px-5 py-24 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#b7f34a]/10 text-2xl text-[#b7f34a]">⚙</span><h1 className="mt-5 text-3xl font-semibold text-white">Choose your team first</h1><p className="mt-3 text-sm leading-6 text-[#78847e]">Open settings in the top-right corner, connect a league, and select the team this workspace should use.</p></div>;
  const me = standings.data?.find((team) => team.id === scope.team.id);
  return <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
    <header className="panel rounded-3xl p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#b7f34a]">{scope.team.league.name || "ESPN league"} · {scope.team.league.season}</p><div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><h1 className="text-4xl font-semibold tracking-[-.04em] text-white sm:text-5xl">{scope.team.name}</h1><p className="mt-3 text-sm text-[#78847e]">Your selected team and league, in one place.</p></div><div className="flex gap-5 text-sm"><Stat label="Record" value={me ? `${me.wins || 0}-${me.losses || 0}${me.ties ? `-${me.ties}` : ""}` : "—"} /><Stat label="Standing" value={me?.standing ? `#${me.standing}` : "Preseason"} /><Stat label="Scoring" value={scope.team.league.scoring_format_label?.replace("_", " ") || "Custom"} /></div></div></header>
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="panel overflow-hidden rounded-2xl"><div className="flex items-end justify-between border-b border-white/[.07] px-5 py-5 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#65716b]">Roster</p><h2 className="mt-1 text-xl font-semibold text-white">Your players</h2></div>{roster.data?.snapshot && <p className="text-xs text-[#65716b]">Updated {new Date(roster.data.snapshot.fetched_at).toLocaleString()}</p>}</div>
        {roster.isLoading ? <div className="space-y-2 p-6">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[.025]" />)}</div> : roster.data?.players.length ? <div className="divide-y divide-white/[.055]">{roster.data.players.map((row) => <Link key={row.player.id} href={`/player-lookup/${row.player.id}`} className="focus-ring flex items-center justify-between px-5 py-4 transition hover:bg-white/[.025] sm:px-6"><div><span className="font-medium text-white">{row.player.name}</span><span className="ml-2 text-xs text-[#65716b]">{row.player.position || "—"} · {row.player.nfl_team || "FA"}</span></div><span className="text-xs text-[#78847e]">{row.lineup_slot || "Roster"} →</span></Link>)}</div> : <div className="px-6 py-20 text-center"><h3 className="font-medium text-white">No roster yet</h3><p className="mt-2 text-sm text-[#78847e]">Your roster will appear after the draft.</p></div>}
      </section>
      <aside className="panel overflow-hidden rounded-2xl"><div className="border-b border-white/[.07] px-5 py-5"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#65716b]">League</p><h2 className="mt-1 text-xl font-semibold text-white">Standings</h2></div><div className="divide-y divide-white/[.055]">{standings.data?.sort((a,b) => Number(a.standing || 999)-Number(b.standing || 999)).map((team) => <div key={team.id} className={`flex items-center gap-3 px-5 py-3 text-sm ${team.id === scope.team.id ? "bg-[#b7f34a]/[.07] text-[#d7fb9e]" : "text-[#9da7a2]"}`}><span className="w-5 font-mono text-xs">{team.standing || "—"}</span><span className="min-w-0 flex-1 truncate">{team.name}</span><span className="font-mono text-xs">{team.wins || 0}-{team.losses || 0}</span></div>)}</div></aside>
    </div>
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-wider text-[#65716b]">{label}</p><p className="mt-1 capitalize text-white">{value}</p></div>; }

