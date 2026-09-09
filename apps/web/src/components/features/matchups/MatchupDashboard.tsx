"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useActiveScope } from "@/lib/scope";
import { PlayerDetailModal } from "@/components/features/players/PlayerDetailModal";

type Team = { id: string; name: string; wins: number | null; losses: number | null; ties: number | null; standing: number | null };
type Player = { id: string; name: string; position: string | null; nfl_team: string | null; lineup_slot: string | null; projected_average_points: number | null; average_points: number | null; injury_status: string | null };
type Matchup = { id: string; week: number; status: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null; home_projected: number | null; away_projected: number | null; home_team: Team; away_team: Team };
type MatchupResponse = { matchup: Matchup | null; week: number; available_weeks: number[]; league: { name: string | null; season: number; last_synced_at: string | null }; lineups: Record<string, Player[]> };

const BENCH = new Set(["BE", "BENCH", "IR", "INJURED RESERVE"]);
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
  const myPlayers = useMemo(() => starters(data?.lineups[scope?.team.id || ""] || []), [data, scope]);
  const opponentPlayers = useMemo(() => starters(data?.lineups[opponent?.id || ""] || []), [data, opponent]);
  const myProjection = matchup ? matchup[`${mySide}_projected`] ?? lineupProjection(myPlayers) : 0;
  const opponentSide = mySide === "home" ? "away" : "home";
  const opponentProjection = matchup ? matchup[`${opponentSide}_projected`] ?? lineupProjection(opponentPlayers) : 0;
  const myScore = matchup ? matchup[`${mySide}_score`] : null;
  const opponentScore = matchup ? matchup[`${opponentSide}_score`] : null;

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
        <p className="text-center font-mono text-[10px] uppercase tracking-[.15em] text-[#78847e]">Week {data.week} · {matchup.status === "final" ? "Final" : "Matchup preview"}</p>
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
          <TeamScore team={mine} score={myScore} projection={myProjection} align="right" label="You" />
          <div className="grid size-10 place-items-center rounded-full border border-white/[.08] bg-black/20 font-mono text-[9px] font-bold text-[#656d61]">VS</div>
          <TeamScore team={opponent} score={opponentScore} projection={opponentProjection} align="left" label={`#${opponent.standing || "—"} seed`} />
        </div>
        <WinBar mine={myProjection} opponent={opponentProjection} />
      </section>

      <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,.8fr)]">
        <section className="overflow-hidden rounded-[14px] border border-white/[.06] bg-white/[.022]">
          <div className="border-b border-white/[.06] px-5 py-4"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">Position by position</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">Starting lineups</h2></div>
          <div className="divide-y divide-white/[.055]">{lineupRows(myPlayers, opponentPlayers).map((row, index) => <LineupRow key={`${row.slot}-${index}`} {...row} onSelect={setSelectedPlayerId} />)}</div>
        </section>
        <aside className="space-y-[18px]">
          <Card eyebrow="Opponent" title={opponent.name}><Metric label="Record" value={`${opponent.wins || 0}-${opponent.losses || 0}${opponent.ties ? `-${opponent.ties}` : ""}`} /><Metric label="League standing" value={opponent.standing ? `#${opponent.standing}` : "—"} /><Metric label="Projected margin" value={`${myProjection >= opponentProjection ? "+" : ""}${(myProjection - opponentProjection).toFixed(1)} pts`} accent={myProjection >= opponentProjection} /></Card>
          <Card eyebrow="Game plan" title="This week"><p className="text-xs leading-5 text-[#8a9280]">{myProjection >= opponentProjection ? `You have a ${Math.abs(myProjection - opponentProjection).toFixed(1)}-point lineup edge. Protect it by checking injury statuses before kickoff.` : `You’re projected ${Math.abs(myProjection - opponentProjection).toFixed(1)} points behind. Look for upside at your weakest position.`}</p><Link href="/free-agents" className="focus-ring mt-4 inline-flex text-xs font-semibold text-[#c9f958]">Improve your lineup →</Link></Card>
        </aside>
      </div>
    </>}
    {selectedPlayerId && <PlayerDetailModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />}
  </main>;
}

function starters(players: Player[]) { return players.filter((player) => !BENCH.has((player.lineup_slot || "").toUpperCase())).sort((a, b) => slotRank(a.lineup_slot) - slotRank(b.lineup_slot)); }
function slotRank(slot: string | null) { const index = slotOrder.indexOf((slot || "").toUpperCase()); return index < 0 ? 99 : index; }
function projection(player?: Player) { return Number(player?.projected_average_points ?? player?.average_points ?? 0); }
function lineupProjection(players: Player[]) { return players.reduce((total, player) => total + projection(player), 0); }
function lineupRows(mine: Player[], theirs: Player[]) { const length = Math.max(mine.length, theirs.length); return Array.from({ length }, (_, index) => ({ slot: mine[index]?.lineup_slot || theirs[index]?.lineup_slot || "—", mine: mine[index], theirs: theirs[index] })); }

function TeamScore({ team, score, projection: projected, align, label }: { team: Team; score: number | null; projection: number; align: "left" | "right"; label: string }) { return <div className={align === "right" ? "text-right" : "text-left"}><p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#8fac49]">{label}</p><h2 className="mt-1 truncate text-sm font-semibold text-[#eef1e9] sm:text-lg">{team.name}</h2><p className="mt-3 font-mono text-3xl font-semibold tracking-[-.05em] text-white sm:text-5xl">{score && score > 0 ? score.toFixed(1) : projected.toFixed(1)}</p><p className="mt-1 text-[10px] text-[#6e7568]">{score && score > 0 ? `${projected.toFixed(1)} projected` : "projected points"}</p></div>; }
function WinBar({ mine, opponent }: { mine: number; opponent: number }) { const chance = mine + opponent ? Math.max(15, Math.min(85, 50 + (mine - opponent) * 1.5)) : 50; return <div className="mx-auto mt-7 max-w-xl"><div className="mb-2 flex justify-between text-[9px] uppercase tracking-[.1em] text-[#697064]"><span>Your edge</span><span>{Math.round(chance)}% outlook</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-gradient-to-r from-[#8bc832] to-[#d9ff6e]" style={{ width: `${chance}%` }} /></div></div>; }
function LineupRow({ slot, mine, theirs, onSelect }: { slot: string; mine?: Player; theirs?: Player; onSelect: (id: string) => void }) { const myValue = projection(mine); const theirValue = projection(theirs); return <div className="grid grid-cols-[1fr_42px_1fr] items-center gap-2 px-4 py-3.5 sm:grid-cols-[1fr_64px_1fr] sm:px-5"><PlayerButton player={mine} value={myValue} winning={myValue > theirValue} align="right" onSelect={onSelect} /><span className="text-center font-mono text-[9px] font-bold uppercase text-[#626a5e]">{slot}</span><PlayerButton player={theirs} value={theirValue} winning={theirValue > myValue} align="left" onSelect={onSelect} /></div>; }
function PlayerButton({ player, value, winning, align, onSelect }: { player?: Player; value: number; winning: boolean; align: "left" | "right"; onSelect: (id: string) => void }) { return <button disabled={!player} onClick={() => player && onSelect(player.id)} className={`focus-ring min-w-0 rounded-[6px] p-1 ${align === "right" ? "text-right" : "text-left"}`}><span className="block truncate text-xs font-medium text-[#dfe3da]">{player?.name || "Open slot"}</span><span className={`mt-0.5 block font-mono text-[10px] ${winning ? "text-[#c9f958]" : "text-[#727a6e]"}`}>{value.toFixed(1)} pts {player?.injury_status ? `· ${player.injury_status}` : ""}</span></button>; }
function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) { return <section className="rounded-[14px] border border-white/[.06] bg-white/[.022] p-5"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">{title}</h2><div className="mt-4 space-y-3">{children}</div></section>; }
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="flex items-center justify-between border-t border-white/[.05] pt-3 text-xs"><span className="text-[#737b70]">{label}</span><span className={`font-mono ${accent ? "text-[#c9f958]" : "text-[#dfe3da]"}`}>{value}</span></div>; }
function Loading() { return <div className="mx-auto max-w-[1120px] space-y-4 p-8"><div className="h-48 animate-pulse rounded-[18px] bg-white/[.025]" /><div className="h-72 animate-pulse rounded-[14px] bg-white/[.025]" /></div>; }
function Empty({ title, body, action, href }: { title: string; body: string; action?: string; href?: string }) { return <div className="mx-auto mt-16 max-w-lg rounded-[14px] border border-white/[.06] bg-white/[.022] px-6 py-16 text-center"><span className="font-mono text-xs text-[#c9f958]">VS</span><h2 className="mt-4 text-lg font-semibold text-[#eef1e9]">{title}</h2><p className="mt-2 text-sm leading-6 text-[#78847e]">{body}</p>{action && href ? <Link href={href} className="focus-ring mt-5 inline-flex rounded-[6px] bg-[#c9f958] px-4 py-2.5 text-xs font-semibold text-[#11170a]">{action}</Link> : null}</div>; }
