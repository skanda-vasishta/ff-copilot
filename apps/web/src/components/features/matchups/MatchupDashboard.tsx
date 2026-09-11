"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AgentThread } from "@ff-copilot/agent-runtime";
import { api } from "@/lib/api";
import { useActiveScope } from "@/lib/scope";
import { PlayerDetailModal } from "@/components/features/players/PlayerDetailModal";
import { createThread } from "@/features/copilot/client/threads";
import { useAgent } from "@/features/copilot/client/useAgent";
import { AgentMessage } from "@/features/copilot/components/AgentMessage";

type Team = { id: string; name: string; wins: number | null; losses: number | null; ties: number | null; standing: number | null };
type Player = { id: string; name: string; position: string | null; nfl_team: string | null; lineup_slot: string | null; projected_average_points: number | null; average_points: number | null; injury_status: string | null; weekly_actual_points: number | null; weekly_projected_points: number | null; provider_player_id: string | null };
type Matchup = { id: string; week: number; status: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null; home_projected: number | null; away_projected: number | null; home_team: Team; away_team: Team };
type MatchupResponse = { matchup: Matchup | null; week: number; available_weeks: number[]; league: { name: string | null; season: number; last_synced_at: string | null }; lineups: Record<string, Player[]> };

const BENCH = new Set(["BE", "BN", "BENCH", "IR", "INJURED RESERVE", "RESERVE", "TAXI"]);
const slotOrder = ["QB", "RB", "RB/WR", "WR", "WR/TE", "TE", "FLEX", "OP", "D/ST", "DST", "K"];

export function MatchupDashboard() {
  const { scope, isLoading: scopeLoading } = useActiveScope();
  const [week, setWeek] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["team-matchup", scope?.team.id, week],
    queryFn: () => api<MatchupResponse>(`/v1/teams/${scope!.team.id}/matchup${week ? `?week=${week}` : ""}`),
    enabled: Boolean(scope),
  });
  const data = query.data;
  const matchup = data?.matchup;
  const mine = scope && matchup ? (matchup.home_team_id === scope.team.id ? matchup.home_team : matchup.away_team) : null;
  const opponent = scope && matchup ? (matchup.home_team_id === scope.team.id ? matchup.away_team : matchup.home_team) : null;
  const mySide = scope && matchup?.home_team_id === scope.team.id ? "home" : "away";
  const myRoster = data?.lineups[scope?.team.id || ""] || [];
  const opponentRoster = data?.lineups[opponent?.id || ""] || [];
  const myPlayers = useMemo(() => starters(myRoster), [myRoster]);
  const opponentPlayers = useMemo(() => starters(opponentRoster), [opponentRoster]);
  const myBench = useMemo(() => bench(myRoster), [myRoster]);
  const opponentBench = useMemo(() => bench(opponentRoster), [opponentRoster]);
  const myProjection = matchup ? matchup[`${mySide}_projected`] ?? lineupProjection(myPlayers) : 0;
  const opponentSide = mySide === "home" ? "away" : "home";
  const opponentProjection = matchup ? matchup[`${opponentSide}_projected`] ?? lineupProjection(opponentPlayers) : 0;
  const myScore = lineupActual(myPlayers) ?? (matchup ? matchup[`${mySide}_score`] : null);
  const opponentScore = lineupActual(opponentPlayers) ?? (matchup ? matchup[`${opponentSide}_score`] : null);

  if (scopeLoading) return <Loading />;
  if (!scope) return <Empty title="Add your first team" body="Connect a league before viewing weekly matchups." action="Open settings" href="/settings" />;

  return <main className="mx-auto max-w-[1120px] px-4 py-7 sm:px-6 lg:px-8">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#9dbe4e]">{scope.team.league.name || "Fantasy league"} · {scope.team.league.season}</p><h1 className="mt-1.5 text-[28px] font-semibold tracking-[-.035em] text-[#eef1e9]">Weekly matchup</h1><p className="mt-1 text-xs text-[#78847e]">Your head-to-head outlook and lineup edges.</p></div>
      {data?.available_weeks.length ? <label className="flex items-center gap-2 text-[10px] uppercase tracking-[.09em] text-[#6e7568]">Week<select value={data.week} onChange={(event) => setWeek(Number(event.target.value))} className="focus-ring h-9 rounded-[7px] border border-white/[.08] bg-[#141612] px-3 text-xs font-semibold text-[#eef1e9]">{data.available_weeks.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}
    </header>

    {query.isLoading ? <Loading /> : query.isError ? <Empty title="Couldn’t load this matchup" body={query.error.message} /> : !matchup || !mine || !opponent ? <Empty title={`No matchup for Week ${data?.week || "—"}`} body="The schedule will appear after your league data is refreshed from ESPN." action="Manage league" href="/settings" /> : <>
      <section className="relative mt-6 overflow-hidden rounded-[18px] border border-white/[.08] bg-[#181a16]/70 px-5 py-6 sm:px-8 sm:py-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9f958]/50 to-transparent" />
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row"><p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#78847e]">Week {data.week} · {matchup.status === "final" ? "Final" : "Matchup preview"}</p></div>
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
          <TeamScore team={mine} score={myScore} projection={myProjection} align="right" label="You" />
          <div className="grid size-10 place-items-center rounded-full border border-white/[.08] bg-black/20 font-mono text-[9px] font-bold text-[#656d61]">VS</div>
          <TeamScore team={opponent} score={opponentScore} projection={opponentProjection} align="left" label={`#${opponent.standing || "—"} seed`} />
        </div>
        <WinBar mine={myProjection} opponent={opponentProjection} />
      </section>

      <MatchupCopilot key={`${scope.team.id}-${data.week}-${opponent.id}`} teamId={scope.team.id} leagueId={scope.team.league_id} season={scope.team.league.season} week={data.week} opponent={opponent.name} />

      <section className="mt-[18px] overflow-hidden rounded-[14px] border border-white/[.07] bg-[#11130f]">
        <div className="border-b border-white/[.06] px-4 py-4 sm:px-5"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">Full box score</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">Starters and bench</h2></div>
        <div className="overflow-x-auto"><div className="min-w-[820px]">
          <ScoreHeader mine={mine.name} theirs={opponent.name} />
          <div className="grid grid-cols-2 border-b border-white/[.08] bg-white/[.025] text-[9px] font-semibold uppercase tracking-[.08em] text-[#687168]"><TableLabels /><TableLabels /></div>
          <div className="divide-y divide-white/[.055]">{lineupRows(myPlayers, opponentPlayers).map((row, index) => <LineupRow key={`starter-${row.slot}-${index}`} {...row} onSelect={setSelectedPlayerId} />)}</div>
          <TotalsRow label="Starter totals" mine={myPlayers} theirs={opponentPlayers} />
          <div className="border-y border-white/[.07] bg-white/[.035] px-5 py-2 text-center text-[9px] font-semibold uppercase tracking-[.14em] text-[#7a8378]">Bench & reserve</div>
          <div className="divide-y divide-white/[.045]">{lineupRows(myBench, opponentBench).map((row, index) => <LineupRow key={`bench-${row.slot}-${index}`} {...row} onSelect={setSelectedPlayerId} />)}</div>
          <TotalsRow label="Bench totals" mine={myBench} theirs={opponentBench} />
        </div></div>
      </section>

      <aside className="mt-[18px] grid gap-[18px] sm:grid-cols-2">
          <Card eyebrow="Opponent" title={opponent.name}><Metric label="Record" value={`${opponent.wins || 0}-${opponent.losses || 0}${opponent.ties ? `-${opponent.ties}` : ""}`} /><Metric label="League standing" value={opponent.standing ? `#${opponent.standing}` : "—"} /><Metric label="Projected margin" value={`${myProjection >= opponentProjection ? "+" : ""}${(myProjection - opponentProjection).toFixed(1)} pts`} accent={myProjection >= opponentProjection} /></Card>
          <Card eyebrow="Game plan" title="This week"><p className="text-xs leading-5 text-[#8a9280]">{myProjection >= opponentProjection ? `You have a ${Math.abs(myProjection - opponentProjection).toFixed(1)}-point lineup edge. Protect it by checking injury statuses before kickoff.` : `You’re projected ${Math.abs(myProjection - opponentProjection).toFixed(1)} points behind. Look for upside at your weakest position.`}</p><Link href="/free-agents" className="focus-ring mt-4 inline-flex text-xs font-semibold text-[#c9f958]">Improve your lineup →</Link></Card>
      </aside>
    </>}
    {selectedPlayerId && <PlayerDetailModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />}
  </main>;
}

function starters(players: Player[]) { return players.filter((player) => !BENCH.has((player.lineup_slot || "").toUpperCase())).sort((a, b) => slotRank(a.lineup_slot) - slotRank(b.lineup_slot)); }
function bench(players: Player[]) { return players.filter((player) => BENCH.has((player.lineup_slot || "").toUpperCase())).sort((a, b) => (a.lineup_slot || "").localeCompare(b.lineup_slot || "") || a.name.localeCompare(b.name)); }
function slotRank(slot: string | null) { const index = slotOrder.indexOf((slot || "").toUpperCase()); return index < 0 ? 99 : index; }
function weeklyProjection(player?: Player) { return Number(player?.weekly_projected_points ?? player?.projected_average_points ?? player?.average_points ?? 0); }
function lineupProjection(players: Player[]) { return players.reduce((total, player) => total + weeklyProjection(player), 0); }
function lineupActual(players: Player[]) { const scores = players.map((player) => player.weekly_actual_points).filter((value): value is number => value != null); return scores.length ? scores.reduce((total, value) => total + value, 0) : null; }
function lineupRows(mine: Player[], theirs: Player[]) { const length = Math.max(mine.length, theirs.length); return Array.from({ length }, (_, index) => ({ slot: mine[index]?.lineup_slot || theirs[index]?.lineup_slot || "—", mine: mine[index], theirs: theirs[index] })); }

function TeamScore({ team, score, projection: projected, align, label }: { team: Team; score: number | null; projection: number; align: "left" | "right"; label: string }) { const hasScore = score != null; return <div className={align === "right" ? "text-right" : "text-left"}><p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#8fac49]">{label}</p><h2 className="mt-1 truncate text-sm font-semibold text-[#eef1e9] sm:text-lg">{team.name}</h2><p className="mt-3 font-mono text-3xl font-semibold tracking-[-.05em] text-white sm:text-5xl">{hasScore ? score.toFixed(1) : projected.toFixed(1)}</p><p className="mt-1 text-[10px] text-[#6e7568]">{hasScore ? `${projected.toFixed(1)} projected` : "projected points"}</p></div>; }
function WinBar({ mine, opponent }: { mine: number; opponent: number }) { const chance = mine + opponent ? Math.max(15, Math.min(85, 50 + (mine - opponent) * 1.5)) : 50; return <div className="mx-auto mt-7 max-w-xl"><div className="mb-2 flex justify-between text-[9px] uppercase tracking-[.1em] text-[#697064]"><span>Your edge</span><span>{Math.round(chance)}% outlook</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-[#8bc832] to-[#d9ff6e]" style={{ width: `${chance}%` }} /></div></div>; }
function ScoreHeader({ mine, theirs }: { mine: string; theirs: string }) { return <div className="grid grid-cols-2 border-b border-white/[.08]"><div className="border-r border-white/[.08] px-5 py-3 text-sm font-semibold text-[#eef1e9]">{mine} box score</div><div className="px-5 py-3 text-sm font-semibold text-[#eef1e9]">{theirs} box score</div></div>; }
function TableLabels() { return <div className="grid grid-cols-[54px_minmax(0,1fr)_58px_58px] px-3 py-2"><span>Slot</span><span>Player, team · pos</span><span className="text-right">Proj</span><span className="text-right">FPTS</span></div>; }
function LineupRow({ slot, mine, theirs, onSelect }: { slot: string; mine?: Player; theirs?: Player; onSelect: (id: string) => void }) { return <div className="grid grid-cols-2"><BoxPlayer slot={slot} player={mine} onSelect={onSelect} border /><BoxPlayer slot={theirs?.lineup_slot || slot} player={theirs} onSelect={onSelect} /></div>; }
function BoxPlayer({ slot, player, onSelect, border = false }: { slot: string; player?: Player; onSelect: (id: string) => void; border?: boolean }) { const projected = weeklyProjection(player); const actual = player?.weekly_actual_points; const image = player?.provider_player_id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${player.provider_player_id}.png` : null; return <div className={`grid min-h-14 grid-cols-[54px_minmax(0,1fr)_58px_58px] items-center px-3 ${border ? "border-r border-white/[.08]" : ""}`}><span className="font-mono text-[10px] font-semibold uppercase text-[#727b71]">{slot === "BN" ? "Bench" : slot}</span><button disabled={!player} onClick={() => player && onSelect(player.id)} className="focus-ring flex min-w-0 items-center gap-2 rounded text-left"><span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/[.04]">{image ? <img src={image} alt="" className="h-full w-full object-cover object-top" /> : <span className="text-[9px] text-[#596158]">{player?.position || "—"}</span>}</span><span className="min-w-0"><span className="block truncate text-[11px] font-medium text-[#dbe0d7]">{player?.name || "Empty"}</span><span className="block truncate text-[9px] uppercase text-[#687168]">{player ? `${player.nfl_team || "FA"} · ${player.position || "—"}${player.injury_status ? ` · ${player.injury_status}` : ""}` : "—"}</span></span></button><span className="text-right font-mono text-[11px] text-[#899187]">{player ? projected.toFixed(1) : "—"}</span><span className={`text-right font-mono text-[11px] ${actual != null ? "font-semibold text-[#eef1e9]" : "text-[#596158]"}`}>{actual != null ? actual.toFixed(1) : "—"}</span></div>; }
function TotalsRow({ label, mine, theirs }: { label: string; mine: Player[]; theirs: Player[] }) { return <div className="grid grid-cols-2 border-t border-white/[.07] bg-white/[.035]"><TotalHalf label={label} players={mine} border /><TotalHalf label={label} players={theirs} /></div>; }
function TotalHalf({ label, players, border = false }: { label: string; players: Player[]; border?: boolean }) { const projected = players.reduce((sum, player) => sum + weeklyProjection(player), 0); const actuals = players.map((player) => player.weekly_actual_points).filter((value): value is number => value != null); return <div className={`grid grid-cols-[1fr_58px_58px] px-3 py-2.5 text-[10px] font-semibold uppercase ${border ? "border-r border-white/[.08]" : ""}`}><span className="text-right text-[#737c72]">{label}</span><span className="text-right font-mono text-[#9da59a]">{projected.toFixed(1)}</span><span className="text-right font-mono text-[#eef1e9]">{actuals.length ? actuals.reduce((sum, value) => sum + value, 0).toFixed(1) : "—"}</span></div>; }

function MatchupCopilot({ teamId, leagueId, season, week, opponent }: { teamId: string; leagueId: string; season: number; week: number; opponent: string }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<AgentThread | null>(null);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const sentPreview = useRef(false);
  const agent = useAgent(thread ? { ...thread, season } : null);
  const prompt = `Give me a concise Week ${week} matchup preview against ${opponent}. Compare both starting lineups and benches, use projected and actual weekly scores, identify my biggest advantages and risks, flag injuries, and recommend the one move that would most improve my odds.`;

  useEffect(() => {
    if (thread && !sentPreview.current) {
      sentPreview.current = true;
      void agent.send(prompt);
    }
  }, [thread, prompt, agent]);

  async function showPreview() {
    setOpen(true);
    if (thread || creating) return;
    setCreating(true);
    try { setThread(await createThread({ teamId, leagueId, title: `Week ${week} matchup preview` })); }
    finally { setCreating(false); }
  }
  async function submit(event: FormEvent) { event.preventDefault(); const value = input.trim(); if (!value) return; setInput(""); await agent.send(value); }

  return <section className="mt-[18px] overflow-hidden rounded-[14px] border border-[#c9f958]/15 bg-[#c9f958]/[.025]">
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#8fac49]">Matchup Copilot</p><p className="mt-1 text-xs text-[#8a9280]">Get the matchup read without leaving this box score.</p></div><button type="button" onClick={open ? () => setOpen(false) : showPreview} className="focus-ring rounded-[6px] border border-[#c9f958]/25 bg-[#c9f958]/10 px-3 py-2 text-[10px] font-semibold text-[#d6fb7a] transition hover:bg-[#c9f958]/15">✦ {open ? "Hide preview" : "Preview with Copilot"}</button></div>
    {open && <div className="border-t border-white/[.06]">
      <div className="max-h-[520px] space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
        {(creating || (thread && agent.status !== "idle" && !agent.messages.length)) && <p className="text-xs text-[#78847e]">Building your matchup preview…</p>}
        {agent.messages.map((message) => <AgentMessage key={message.id} message={message} />)}
        {agent.status !== "idle" && agent.status !== "error" && agent.messages.length > 0 && <p className="text-xs text-[#78847e]">{agent.status === "running-tool" ? "Checking league data…" : "Thinking…"}</p>}
        {agent.error && <p className="text-xs text-red-300">{agent.error}</p>}
      </div>
      {thread && <form onSubmit={submit} className="flex items-end gap-2 border-t border-white/[.06] p-3"><textarea aria-label="Ask a matchup follow-up" rows={1} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a follow-up about this matchup…" className="min-h-9 flex-1 resize-none rounded-[7px] border border-white/[.08] bg-white/[.025] px-3 py-2 text-xs text-[#e8ebe3] outline-none focus:border-[#c9f958]/25"/><button disabled={!input.trim() || agent.status !== "idle"} className="h-9 rounded-[6px] bg-[#c9f958] px-3 text-[10px] font-semibold text-[#15200b] disabled:opacity-25">Send</button><Link href="/copilot" className="focus-ring grid h-9 place-items-center rounded-[6px] px-2 text-[10px] text-[#78847e] hover:text-[#dfe3da]">Full chat →</Link></form>}
    </div>}
  </section>;
}
function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) { return <section className="rounded-[14px] border border-white/[.06] bg-white/[.022] p-5"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">{title}</h2><div className="mt-4 space-y-3">{children}</div></section>; }
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="flex items-center justify-between border-t border-white/[.05] pt-3 text-xs"><span className="text-[#737b70]">{label}</span><span className={`font-mono ${accent ? "text-[#c9f958]" : "text-[#dfe3da]"}`}>{value}</span></div>; }
function Loading() { return <div className="mx-auto max-w-[1120px] space-y-4 p-8"><div className="h-48 animate-pulse rounded-[18px] bg-white/[.025]" /><div className="h-72 animate-pulse rounded-[14px] bg-white/[.025]" /></div>; }
function Empty({ title, body, action, href }: { title: string; body: string; action?: string; href?: string }) { return <div className="mx-auto mt-16 max-w-lg rounded-[14px] border border-white/[.06] bg-white/[.022] px-6 py-16 text-center"><span className="font-mono text-xs text-[#c9f958]">VS</span><h2 className="mt-4 text-lg font-semibold text-[#eef1e9]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#78847e]">{body}</p>{action && href ? <Link href={href} className="focus-ring mt-5 inline-flex rounded-[6px] bg-[#c9f958] px-4 py-2.5 text-xs font-semibold text-[#11170a]">{action}</Link> : null}</div>; }
