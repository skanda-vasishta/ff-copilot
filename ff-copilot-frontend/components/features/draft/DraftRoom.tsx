"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, Player } from "@/lib/api";
import {
  draftStatus,
  espnDraftUrl,
  EspnDraftPayload,
  parseEspnLeagueInput,
} from "@/lib/espn-draft";

type DraftPlayer = Player & { espn_id: string | null };
type PoolResponse = { items: DraftPlayer[]; total: number };
type DraftConfig = { leagueId: string; season: number };
type Snapshot = {
  projected_total_points: number | null;
  projected_average_points: number | null;
  position_rank: number | null;
  percent_owned: number | null;
  injury_status: string | null;
  fetched_at: string;
};
type RankingResponse = {
  summary: {
    average: number | null;
    median: number | null;
    minimum: number | null;
    maximum: number | null;
    source_count: number;
  };
};
type SourceDocument = {
  id: string;
  source: string;
  title: string | null;
  content: string;
  source_url: string | null;
};

const STORAGE_KEY = "ff-copilot:draft-room";
const positions = ["ALL", "QB", "RB", "WR", "TE", "K", "D/ST"];
const posTone: Record<string, string> = {
  QB: "text-violet-300",
  RB: "text-cyan-300",
  WR: "text-amber-200",
  TE: "text-rose-300",
  K: "text-slate-300",
  "D/ST": "text-emerald-300",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

export function DraftRoom() {
  const [config, setConfig] = useState<DraftConfig | null>(null);
  const [leagueInput, setLeagueInput] = useState("");
  const [season, setSeason] = useState(2026);
  const [payload, setPayload] = useState<EspnDraftPayload | null>(null);
  const [feedError, setFeedError] = useState("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("ALL");
  const [sort, setSort] = useState<"rank" | "projection" | "name">("rank");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [myTeamId, setMyTeamId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<DraftPlayer | null>(
    null,
  );
  const etag = useRef<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setConfig(JSON.parse(saved));
    } catch {
      /* ignore malformed local state */
    }
  }, []);

  useEffect(() => {
    if (!config) return;
    const saved = localStorage.getItem(
      `${STORAGE_KEY}:my-team:${config.leagueId}:${config.season}`,
    );
    const savedTeamId = saved ? Number(saved) : null;
    setMyTeamId(savedTeamId);
    if (savedTeamId) setTeamId(savedTeamId);
  }, [config]);

  const pool = useQuery({
    queryKey: ["draft-player-pool", config?.season],
    queryFn: () =>
      api<PoolResponse>(`/v1/draft/player-pool?season=${config!.season}`),
    enabled: Boolean(config),
  });

  useEffect(() => {
    if (!config) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(
          espnDraftUrl(config.leagueId, config.season),
          {
            headers: etag.current
              ? { "If-None-Match": etag.current }
              : undefined,
          },
        );
        if (response.status !== 304) {
          if (!response.ok)
            throw new Error(
              response.status === 404
                ? "League not found. Confirm it is public and the season is correct."
                : `ESPN returned ${response.status}.`,
            );
          etag.current = response.headers.get("etag");
          const next = (await response.json()) as EspnDraftPayload;
          if (!stopped) {
            setPayload(next);
            setFeedError("");
            setTeamId((current) => current ?? next.teams[0]?.id ?? null);
          }
        }
        if (!stopped) setLastChecked(new Date());
      } catch (error) {
        if (!stopped)
          setFeedError(
            error instanceof Error ? error.message : "Could not reach ESPN.",
          );
      } finally {
        if (!stopped)
          timer = setTimeout(
            poll,
            payload?.draftDetail.inProgress ? 2000 : 5000,
          );
      }
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [config, payload?.draftDetail.inProgress]);

  const playerByEspnId = useMemo(
    () =>
      new Map(
        (pool.data?.items || [])
          .filter((p) => p.espn_id)
          .map((p) => [String(p.espn_id), p]),
      ),
    [pool.data],
  );
  const picks = useMemo(
    () =>
      [...(payload?.draftDetail.picks || [])].sort(
        (a, b) => a.overallPickNumber - b.overallPickNumber,
      ),
    [payload],
  );
  const completed = useMemo(
    () => picks.filter((pick) => pick.playerId > 0),
    [picks],
  );
  const currentPick = picks.find((pick) => pick.playerId <= 0);
  const draftedIds = useMemo(
    () => new Set(completed.map((pick) => String(pick.playerId))),
    [completed],
  );
  const teamById = useMemo(
    () => new Map((payload?.teams || []).map((team) => [team.id, team])),
    [payload],
  );
  const available = useMemo(
    () =>
      (pool.data?.items || [])
        .filter(
          (player) =>
            !player.espn_id || !draftedIds.has(String(player.espn_id)),
        )
        .filter((player) => position === "ALL" || player.position === position)
        .filter((player) =>
          player.name.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : sort === "projection"
              ? (b.projected_total_points ?? -1) -
                (a.projected_total_points ?? -1)
              : (a.median_rank ?? 9999) - (b.median_rank ?? 9999),
        ),
    [pool.data, draftedIds, position, search, sort],
  );
  const selectedTeam = teamId == null ? null : teamById.get(teamId);
  const roster = completed.filter((pick) => pick.teamId === teamId);
  const status = payload ? draftStatus(payload) : "scheduled";

  function initialize(event: FormEvent) {
    event.preventDefault();
    const leagueId = parseEspnLeagueInput(leagueInput);
    if (!leagueId) {
      setFeedError("Paste a valid ESPN league URL or numeric league ID.");
      return;
    }
    const next = { leagueId, season };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setPayload(null);
    setFeedError("");
    etag.current = null;
    setConfig(next);
  }
  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(null);
    setPayload(null);
    setFeedError("");
    etag.current = null;
  }
  function saveMyTeam(nextTeamId: number | null) {
    if (!config) return;
    const key = `${STORAGE_KEY}:my-team:${config.leagueId}:${config.season}`;
    if (nextTeamId == null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(nextTeamId));
    setMyTeamId(nextTeamId);
    if (nextTeamId != null) setTeamId(nextTeamId);
    setSettingsOpen(false);
  }

  if (!config)
    return (
      <section className="relative min-h-[72vh] overflow-hidden rounded-[28px] border border-white/[.08] bg-[#090d10] p-6 sm:p-10 lg:p-16">
        <div className="grid-fade absolute inset-0 opacity-80" />
        <div className="absolute right-[-9rem] top-[-9rem] size-[28rem] rounded-full border border-[#b7f34a]/10 shadow-[0_0_120px_rgba(183,243,74,.08)]" />
        <div className="relative max-w-3xl">
          <p className="font-mono text-xs font-bold uppercase tracking-[.3em] text-[#b7f34a]">
            FF-26 / Live operations
          </p>
          <h1 className="mt-5 text-5xl font-black uppercase leading-[.9] tracking-[-.055em] text-white sm:text-7xl">
            Draft
            <br />
            <span className="text-[#b7f34a]">Room</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-[#97a39d]">
            Connect a public ESPN league to turn its live draft feed into a
            scouting board. Picks, remaining players, and every team&apos;s
            roster update automatically.
          </p>
          <form
            onSubmit={initialize}
            className="panel mt-10 rounded-2xl p-3 sm:flex sm:gap-3"
          >
            <label className="block flex-1">
              <span className="sr-only">ESPN league URL or ID</span>
              <input
                autoFocus
                value={leagueInput}
                onChange={(e) => setLeagueInput(e.target.value)}
                placeholder="Paste ESPN league URL or ID"
                className="focus-ring w-full rounded-xl border border-white/[.08] bg-black/30 px-4 py-4 text-sm text-white placeholder:text-[#59635e]"
              />
            </label>
            <label className="mt-2 block sm:mt-0">
              <span className="sr-only">Season</span>
              <input
                type="number"
                min="2020"
                max="2035"
                value={season}
                onChange={(e) => setSeason(Number(e.target.value))}
                className="focus-ring w-full rounded-xl border border-white/[.08] bg-black/30 px-4 py-4 font-mono text-sm text-white sm:w-28"
              />
            </label>
            <button className="focus-ring mt-2 w-full rounded-xl bg-[#b7f34a] px-6 py-4 text-xs font-black uppercase tracking-[.16em] text-[#10140a] transition hover:bg-[#c9fa70] sm:mt-0 sm:w-auto">
              Enter room →
            </button>
          </form>
          {feedError && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {feedError}
            </p>
          )}
          <p className="mt-4 text-xs text-[#637069]">
            The league must be public. No ESPN password or account connection is
            required.
          </p>
        </div>
      </section>
    );

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-white/[.08] bg-[#0c1114] p-5">
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-3">
              <span
                className={`size-2 rounded-full ${feedError ? "bg-red-400" : "animate-pulse bg-[#b7f34a]"}`}
              />
              <p className="font-mono text-[10px] uppercase tracking-[.22em] text-[#78847e]">
                ESPN feed · {feedError ? "reconnecting" : "connected"}
              </p>
            </div>
            <h1 className="mt-3 text-3xl font-black uppercase tracking-[-.035em] text-white">
              {payload?.settings.name || `League ${config.leagueId}`}
            </h1>
            <p className="mt-1 font-mono text-xs text-[#78847e]">
              {config.season} · League {config.leagueId} · checked{" "}
              {lastChecked?.toLocaleTimeString() || "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Stat label="Status" value={status} />
            <Stat
              label="Picks"
              value={`${completed.length}/${picks.length || "—"}`}
            />
            <Stat
              label="Clock"
              value={
                payload?.settings.draftSettings.timePerSelection
                  ? `${payload.settings.draftSettings.timePerSelection}s`
                  : "—"
              }
            />
            <button
              onClick={() => setSettingsOpen(true)}
              className={`focus-ring rounded-lg border px-3 py-3 text-xs font-semibold ${myTeamId == null ? "border-[#b7f34a]/50 bg-[#b7f34a]/10 text-[#d7ffa0]" : "border-white/[.1] text-[#aab4af] hover:text-white"}`}
            >
              ⚙{" "}
              {myTeamId == null
                ? "Set my team"
                : teamById.get(myTeamId)?.abbrev || "Settings"}
            </button>
            <button
              onClick={reset}
              className="focus-ring rounded-lg border border-white/[.1] px-3 py-3 text-xs text-[#8c9992] hover:text-white"
            >
              Change league
            </button>
          </div>
        </div>
        {feedError && (
          <p
            role="alert"
            className="relative mt-4 rounded-lg border border-red-400/20 bg-red-400/[.06] px-3 py-2 text-xs text-red-200"
          >
            {feedError} Keeping the last valid board visible.
          </p>
        )}
      </header>

      {status === "scheduled" && myTeamId == null && payload?.teams.length ? (
        <button
          onClick={() => setSettingsOpen(true)}
          className="focus-ring flex w-full items-center justify-between rounded-xl border border-[#b7f34a]/25 bg-[#b7f34a]/[.055] px-4 py-3 text-left"
        >
          <span>
            <strong className="text-sm text-white">Which team is yours?</strong>
            <span className="ml-2 text-xs text-[#93a28f]">
              Choose it before the draft so your pick slots and roster stay in
              focus.
            </span>
          </span>
          <span className="text-xs font-bold text-[#b7f34a]">
            Choose team →
          </span>
        </button>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 space-y-5">
          <section className="panel overflow-hidden rounded-2xl">
            <SectionHead
              kicker="Command board"
              title="Draft board"
              note={
                currentPick
                  ? `${status === "live" ? "On the clock" : "First pick"}: #${currentPick.overallPickNumber} · ${teamById.get(currentPick.teamId)?.abbrev || `Team ${currentPick.teamId}`}`
                  : "Waiting for ESPN draft order"
              }
            />
            <div className="max-h-[520px] overflow-auto p-4">
              <div
                className="grid min-w-[720px] gap-2"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, payload?.teams.length || 10)}, minmax(112px, 1fr))`,
                }}
              >
                {picks.map((pick) => {
                  const player = playerByEspnId.get(String(pick.playerId));
                  const team = teamById.get(pick.teamId);
                  const active =
                    pick.id === currentPick?.id && status === "live";
                  const mine = pick.teamId === myTeamId;
                  return (
                    <div
                      key={`${pick.overallPickNumber}-${pick.teamId}`}
                      className={`min-h-24 rounded-lg border p-2.5 ${active ? "border-[#b7f34a] bg-[#b7f34a]/10 shadow-[0_0_22px_rgba(183,243,74,.08)]" : mine ? "border-cyan-300/35 bg-cyan-300/[.045]" : pick.playerId > 0 ? "border-white/[.08] bg-white/[.035]" : "border-dashed border-white/[.07] bg-black/10"}`}
                    >
                      <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-[#65716b]">
                        <span>
                          {pick.roundId}.{pick.roundPickNumber}
                        </span>
                        <span>{team?.abbrev || pick.teamId}</span>
                      </div>
                      {pick.playerId > 0 ? (
                        <>
                          <button
                            onClick={() => player && setSelectedPlayer(player)}
                            disabled={!player}
                            className="focus-ring mt-3 block w-full truncate rounded text-left text-xs font-bold text-white enabled:hover:text-[#b7f34a]"
                            title={player?.name}
                          >
                            {player?.name || `ESPN #${pick.playerId}`}
                          </button>
                          <p
                            className={`mt-1 font-mono text-[10px] ${posTone[player?.position || ""] || "text-[#78847e]"}`}
                          >
                            {player?.position || "PLAYER"} ·{" "}
                            {player?.nfl_team || "—"}
                          </p>
                        </>
                      ) : (
                        <p
                          className={`mt-5 text-[10px] font-bold uppercase tracking-[.16em] ${active ? "text-[#c8f775]" : "text-[#46514b]"}`}
                        >
                          {active ? "On clock" : "Open"}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {!picks.length && (
                <Empty text="Draft order has not been published by ESPN yet." />
              )}
            </div>
          </section>

          <section className="panel overflow-hidden rounded-2xl">
            <SectionHead
              kicker="Scouting pool"
              title={`${available.length} available players`}
              note="Rank is the median across stored sources—not ESPN only."
            />
            <div className="flex flex-col gap-2 border-b border-white/[.07] p-3 md:flex-row">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search the board…"
                className="focus-ring min-w-0 flex-1 rounded-lg border border-white/[.08] bg-black/20 px-3 py-2.5 text-sm text-white"
              />
              <div className="flex gap-1 overflow-x-auto">
                {positions.map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setPosition(pos)}
                    className={`focus-ring rounded-lg px-2.5 py-2 text-[10px] font-bold ${position === pos ? "bg-[#b7f34a] text-black" : "bg-white/[.04] text-[#8c9992]"}`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="focus-ring rounded-lg border border-white/[.08] bg-[#0a0e10] px-3 py-2 text-xs text-white"
              >
                <option value="rank">Median rank</option>
                <option value="projection">Projection</option>
                <option value="name">Name</option>
              </select>
            </div>
            <div className="max-h-[620px] overflow-auto">
              <table className="w-full min-w-[650px] text-left">
                <thead className="sticky top-0 bg-[#101519] text-[9px] uppercase tracking-[.16em] text-[#65716b]">
                  <tr>
                    <th className="px-4 py-3">Player</th>
                    <th>Pos</th>
                    <th>Team</th>
                    <th className="text-right">Median rank</th>
                    <th className="px-4 text-right">Projection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[.055]">
                  {available.map((player) => (
                    <tr key={player.id} className="hover:bg-white/[.025]">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedPlayer(player)}
                          className="focus-ring rounded text-left font-medium text-white hover:text-[#b7f34a]"
                        >
                          {player.name}
                        </button>
                        {player.injury_status &&
                          player.injury_status.toUpperCase() !== "ACTIVE" && (
                            <span className="ml-2 text-[9px] text-amber-300">
                              {player.injury_status}
                            </span>
                          )}
                      </td>
                      <td
                        className={`font-mono text-xs ${posTone[player.position || ""] || "text-[#8c9992]"}`}
                      >
                        {player.position || "—"}
                      </td>
                      <td className="font-mono text-xs text-[#78847e]">
                        {player.nfl_team || "FA"}
                      </td>
                      <td className="text-right font-mono text-sm text-white">
                        {player.median_rank?.toFixed(1) || "—"}
                        <span className="ml-1 text-[9px] text-[#59635e]">
                          {player.source_count
                            ? `${player.source_count} src`
                            : ""}
                        </span>
                      </td>
                      <td className="px-4 text-right font-mono text-sm text-white">
                        {player.projected_total_points?.toFixed(1) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pool.isLoading && (
                <Empty text="Loading centralized player data…" />
              )}
              {pool.error && (
                <Empty
                  text={`Player pool unavailable: ${pool.error.message}`}
                />
              )}
            </div>
          </section>
        </main>

        <aside className="space-y-5">
          <section className="panel overflow-hidden rounded-2xl">
            <SectionHead kicker="League room" title="Team rosters" />
            <div className="flex gap-2 overflow-x-auto border-b border-white/[.07] p-3 xl:grid xl:grid-cols-2">
              {payload?.teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setTeamId(team.id)}
                  className={`focus-ring flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left ${teamId === team.id ? "border-[#b7f34a]/50 bg-[#b7f34a]/10 text-white" : "border-white/[.07] bg-black/10 text-[#89958f]"}`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded bg-white/[.06] text-[9px] font-black">
                    {team.abbrev || initials(team.name)}
                  </span>
                  <span className="max-w-24 truncate text-[10px] font-bold">
                    {team.name}
                  </span>
                </button>
              ))}
            </div>
            <div className="p-4">
              <p className="text-sm font-bold text-white">
                {selectedTeam?.name || "Select a team"}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[#65716b]">
                {roster.length} selections
              </p>
              <div className="mt-4 space-y-1">
                {roster.map((pick) => {
                  const player = playerByEspnId.get(String(pick.playerId));
                  return (
                    <div
                      key={pick.id}
                      className="flex items-center gap-3 rounded-lg border border-white/[.055] bg-black/10 p-2.5"
                    >
                      <span className="w-6 font-mono text-[9px] text-[#59635e]">
                        {pick.roundId}.{pick.roundPickNumber}
                      </span>
                      <span
                        className={`w-8 font-mono text-[10px] font-bold ${posTone[player?.position || ""] || "text-[#8c9992]"}`}
                      >
                        {player?.position || "—"}
                      </span>
                      {player ? (
                        <button
                          onClick={() => setSelectedPlayer(player)}
                          className="focus-ring min-w-0 truncate rounded text-left text-xs font-medium text-white hover:text-[#b7f34a]"
                        >
                          {player.name}
                        </button>
                      ) : (
                        <span className="truncate text-xs text-white">
                          ESPN #{pick.playerId}
                        </span>
                      )}
                    </div>
                  );
                })}
                {!roster.length && (
                  <Empty
                    text={
                      status === "scheduled"
                        ? "No picks yet. The roster will fill live."
                        : "This team has not selected yet."
                    }
                  />
                )}
              </div>
            </div>
          </section>
          <section className="panel rounded-2xl p-4">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[#65716b]">
              Recent tape
            </p>
            <div className="mt-3 space-y-2">
              {completed
                .slice(-6)
                .reverse()
                .map((pick) => {
                  const player = playerByEspnId.get(String(pick.playerId));
                  return (
                    <div
                      key={pick.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      {player ? (
                        <button
                          onClick={() => setSelectedPlayer(player)}
                          className="focus-ring min-w-0 truncate rounded text-left text-[#bdc6c1] hover:text-[#b7f34a]"
                        >
                          {player.name}
                        </button>
                      ) : (
                        <span className="min-w-0 truncate text-[#bdc6c1]">
                          ESPN #{pick.playerId}
                        </span>
                      )}
                      <span className="shrink-0 font-mono text-[9px] text-[#65716b]">
                        #{pick.overallPickNumber}{" "}
                        {teamById.get(pick.teamId)?.abbrev}
                      </span>
                    </div>
                  );
                })}
              {!completed.length && (
                <p className="text-xs leading-5 text-[#65716b]">
                  Selections will appear here as ESPN records them.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
      {settingsOpen && payload ? (
        <DraftSettings
          teams={payload.teams}
          myTeamId={myTeamId}
          onSave={saveMyTeam}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {selectedPlayer ? (
        <PlayerModal
          player={selectedPlayer}
          season={config.season}
          onClose={() => setSelectedPlayer(null)}
        />
      ) : null}
    </div>
  );
}

function DraftSettings({
  teams,
  myTeamId,
  onSave,
  onClose,
}: {
  teams: EspnDraftPayload["teams"];
  myTeamId: number | null;
  onSave: (teamId: number | null) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState(
    myTeamId == null ? "" : String(myTeamId),
  );
  useModal(onClose);
  return (
    <ModalFrame onClose={onClose} label="Draft Room settings">
      <div className="border-b border-white/[.08] p-5 sm:p-6">
        <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#b7f34a]">
          Draft settings
        </p>
        <h2 className="mt-2 text-2xl font-black uppercase tracking-[-.03em] text-white">
          Choose my team
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#87938d]">
          This keeps your roster selected and marks every one of your slots on
          the draft board. You can change it at any time.
        </p>
      </div>
      <div className="grid gap-2 p-5 sm:grid-cols-2 sm:p-6">
        {teams.map((team) => (
          <button
            key={team.id}
            onClick={() => setChoice(String(team.id))}
            className={`focus-ring flex items-center gap-3 rounded-xl border p-3 text-left ${choice === String(team.id) ? "border-[#b7f34a]/60 bg-[#b7f34a]/10" : "border-white/[.08] bg-black/15 hover:bg-white/[.035]"}`}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[.06] font-mono text-[10px] font-black text-white">
              {team.abbrev || initials(team.name)}
            </span>
            <span className="min-w-0 truncate text-sm font-semibold text-white">
              {team.name}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-white/[.08] p-5 sm:px-6">
        <button
          onClick={() => onSave(null)}
          className="focus-ring rounded-lg px-3 py-2 text-xs text-[#78847e] hover:text-white"
        >
          Clear selection
        </button>
        <button
          disabled={!choice}
          onClick={() => onSave(Number(choice))}
          className="focus-ring rounded-lg bg-[#b7f34a] px-5 py-3 text-xs font-black uppercase tracking-[.12em] text-[#10140a] disabled:opacity-40"
        >
          Save team
        </button>
      </div>
    </ModalFrame>
  );
}

function PlayerModal({
  player,
  season,
  onClose,
}: {
  player: DraftPlayer;
  season: number;
  onClose: () => void;
}) {
  useModal(onClose);
  const snapshots = useQuery({
    queryKey: ["player-snapshots", player.id],
    queryFn: () =>
      api<Snapshot[]>(`/v1/players/${player.id}/snapshots?season=${season}`),
  });
  const rankings = useQuery({
    queryKey: ["player-rankings", player.id],
    queryFn: () =>
      api<RankingResponse>(
        `/v1/players/${player.id}/rankings?season=${season}`,
      ),
  });
  const sources = useQuery({
    queryKey: ["player-sources", player.id],
    queryFn: () => api<SourceDocument[]>(`/v1/players/${player.id}/sources`),
  });
  const latest = snapshots.data?.[0];
  const sourceItems = (sources.data || [])
    .filter((item) => item.source !== "openai_summary")
    .slice(0, 3);
  const loading =
    snapshots.isLoading || rankings.isLoading || sources.isLoading;
  return (
    <ModalFrame onClose={onClose} label={`${player.name} player file`} wide>
      <header className="relative overflow-hidden border-b border-white/[.08] p-5 sm:p-7">
        <div className="absolute -right-16 -top-20 size-56 rounded-full bg-[#b7f34a]/[.07] blur-3xl" />
        <div className="relative">
          <p
            className={`font-mono text-[10px] font-bold uppercase tracking-[.18em] ${posTone[player.position || ""] || "text-[#b7f34a]"}`}
          >
            {player.position || "NFL"} · {player.nfl_team || "Free agent"}
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-[-.04em] text-white sm:text-4xl">
            {player.name}
          </h2>
          <p className="mt-2 text-xs text-[#78847e]">
            Cross-source player file · {season}
          </p>
        </div>
      </header>
      {loading ? (
        <div className="grid gap-3 p-6 sm:grid-cols-2">
          <div className="h-28 animate-pulse rounded-xl bg-white/[.035]" />
          <div className="h-28 animate-pulse rounded-xl bg-white/[.035]" />
        </div>
      ) : (
        <div className="p-5 sm:p-7">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <QuickStat
              label="Projection"
              value={formatNumber(
                latest?.projected_total_points ?? player.projected_total_points,
              )}
            />
            <QuickStat
              label="Per game"
              value={formatNumber(latest?.projected_average_points)}
            />
            <QuickStat
              label="Median rank"
              value={formatNumber(
                rankings.data?.summary.median ?? player.median_rank,
              )}
            />
            <QuickStat
              label="Position rank"
              value={
                latest?.position_rank == null ? "—" : `#${latest.position_rank}`
              }
            />
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-[1fr_210px]">
            <section>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[.08em] text-white">
                  Latest source notes
                </h3>
                <span className="font-mono text-[9px] text-[#65716b]">
                  {rankings.data?.summary.source_count || player.source_count}{" "}
                  rank sources
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {sourceItems.map((item) => (
                  <details
                    key={item.id}
                    className="group rounded-xl border border-white/[.07] bg-black/15"
                  >
                    <summary className="focus-ring cursor-pointer list-none rounded-xl p-3">
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-[#b7f34a]">
                          {item.source}
                        </span>
                        <span className="text-xs text-[#65716b] transition group-open:rotate-45 group-open:text-[#b7f34a]">
                          +
                        </span>
                      </span>
                      <span className="mt-2 line-clamp-2 block text-xs leading-5 text-[#aab4af] group-open:hidden">
                        {item.title || item.content}
                      </span>
                      <span className="mt-2 block text-[9px] font-semibold uppercase tracking-wider text-[#65716b] group-open:hidden">
                        Read full note
                      </span>
                    </summary>
                    <div className="border-t border-white/[.07] px-3 pb-4 pt-3">
                      {item.title && (
                        <p className="text-xs font-semibold leading-5 text-white">
                          {item.title}
                        </p>
                      )}
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[#aab4af]">
                        {item.content}
                      </p>
                      {item.source_url && (
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring mt-3 inline-flex rounded text-[10px] font-semibold text-[#b7f34a] hover:underline"
                        >
                          Original ↗
                        </a>
                      )}
                    </div>
                  </details>
                ))}
                {!sourceItems.length && (
                  <p className="rounded-xl border border-dashed border-white/[.08] p-5 text-xs text-[#65716b]">
                    No source notes collected for this player yet.
                  </p>
                )}
              </div>
            </section>
            <aside className="rounded-xl border border-white/[.07] bg-black/15 p-4">
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#65716b]">
                Availability
              </p>
              <p className="mt-3 text-sm font-semibold text-white">
                {latest?.injury_status &&
                latest.injury_status.toUpperCase() !== "ACTIVE"
                  ? latest.injury_status
                  : "No injury designation"}
              </p>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[#78847e]">Rostered</dt>
                  <dd className="font-mono text-white">
                    {latest?.percent_owned == null
                      ? "—"
                      : `${latest.percent_owned.toFixed(1)}%`}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78847e]">Best rank</dt>
                  <dd className="font-mono text-white">
                    {formatNumber(rankings.data?.summary.minimum, 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[#78847e]">Worst rank</dt>
                  <dd className="font-mono text-white">
                    {formatNumber(rankings.data?.summary.maximum, 0)}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </div>
      )}
      <div className="flex items-center justify-end border-t border-white/[.08] p-4 sm:px-7">
        <Link
          href={`/player-lookup/${player.id}`}
          className="focus-ring rounded-lg bg-[#b7f34a] px-5 py-3 text-xs font-black uppercase tracking-[.12em] text-[#10140a]"
        >
          Open full player file →
        </Link>
      </div>
    </ModalFrame>
  );
}

function ModalFrame({
  children,
  onClose,
  label,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm"
      role="presentation"
    >
      <button
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`panel relative my-auto max-h-[calc(100vh-1.5rem)] w-full overflow-y-auto rounded-2xl shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}
      >
        <button
          aria-label="Close modal"
          onClick={onClose}
          className="focus-ring absolute right-4 top-4 z-10 grid size-9 place-items-center rounded-full border border-white/[.1] bg-[#0b0f12] text-lg text-[#8c9992] hover:text-white"
        >
          ×
        </button>
        {children}
      </section>
    </div>
  );
}

function useModal(onClose: () => void) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[.07] bg-black/15 p-3">
      <p className="text-[9px] uppercase tracking-[.12em] text-[#65716b]">
        {label}
      </p>
      <p className="mt-2 font-mono text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
function formatNumber(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : value.toFixed(digits);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[.08] bg-black/20 px-3 py-2">
      <p className="font-mono text-[8px] uppercase tracking-[.16em] text-[#65716b]">
        {label}
      </p>
      <p className="mt-1 text-xs font-bold uppercase text-white">{value}</p>
    </div>
  );
}
function SectionHead({
  kicker,
  title,
  note,
}: {
  kicker: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 border-b border-white/[.07] bg-black/10 px-4 py-4 sm:flex-row sm:items-end">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[.2em] text-[#b7f34a]">
          {kicker}
        </p>
        <h2 className="mt-1 text-lg font-black uppercase tracking-[-.02em] text-white">
          {title}
        </h2>
      </div>
      {note && (
        <p className="max-w-sm text-[10px] leading-4 text-[#6e7a74]">{note}</p>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-xs leading-5 text-[#65716b]">
      {text}
    </div>
  );
}
