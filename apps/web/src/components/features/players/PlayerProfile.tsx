"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useActiveScope } from "@/lib/scope";

type PlayerRecord = {
  id: string;
  name: string;
  position: string | null;
  nfl_team: string | null;
  active: boolean;
};
type Snapshot = {
  id: string;
  season: number;
  week: number | null;
  source: string;
  position_rank: number | null;
  injury_status: string | null;
  total_points: number | null;
  average_points: number | null;
  projected_total_points: number | null;
  projected_average_points: number | null;
  percent_owned: number | null;
  percent_started: number | null;
  fetched_at: string;
};
type Ranking = {
  id: string;
  source: string;
  scoring_format: string;
  ranking_type: string;
  overall_rank: number | null;
  position_rank: number | null;
  fetched_at: string;
};
type RankingResponse = {
  items: Ranking[];
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
  published_at: string | null;
  fetched_at: string;
  metadata?: Record<string, unknown>;
};
type PlayerDetail = {
  player: PlayerRecord;
  snapshots: Snapshot[];
  projections: {
    projected_total_points: number | null;
    projected_average_points: number | null;
    source_count: number;
    scoring_format: string;
    scope: string;
    games_denominator: number;
    sources: Array<{
      source: string;
      projected_total_points: number;
      source_updated_at: string | null;
      fetched_at: string;
    }>;
  };
  rankings: RankingResponse;
  sources: SourceDocument[];
};

const sourceNames: Record<string, string> = {
  espn: "ESPN",
  fftoday: "FFToday",
  fantasypros: "FantasyPros",
  reddit: "Reddit",
};
const sourceLinks: Record<string, string> = {
  espn: "https://fantasy.espn.com/football/players/projections",
  fftoday: "https://www.fftoday.com/rankings/playerproj.php",
  fantasypros: "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php",
};

function number(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : value.toFixed(digits);
}
function date(value: string | null) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";
}

export function PlayerProfile({ playerId }: { playerId: string }) {
  const { scope, isLoading: loadingScope } = useActiveScope();
  const season = scope?.team.league.season;
  const detail = useQuery({
    queryKey: ["player-detail", playerId, season],
    queryFn: () =>
      api<PlayerDetail>(`/v1/players/${playerId}/detail?season=${season}`),
    enabled: Boolean(season),
  });
  const player = detail.data?.player;
  const rankings = detail.data?.rankings;
  const projections = detail.data?.projections;
  const sources = detail.data?.sources || [];
  const latest = detail.data?.snapshots.find((snapshot) => snapshot.source === "espn");

  if (loadingScope || detail.isLoading)
    return (
      <div className="mt-6 space-y-4">
        <div className="h-44 animate-pulse rounded-lg bg-white/[.03]" />
        <div className="h-72 animate-pulse rounded-lg bg-white/[.03]" />
      </div>
    );
  if (!scope) return <div className="mt-6 rounded-lg border border-white/[.08] p-12 text-center"><h2 className="text-xl font-semibold text-white">Select a team first</h2><p className="mt-2 text-sm text-[#78847e]">Use workspace settings in the top-right corner.</p></div>;
  if (detail.error || !player)
    return (
      <div
        role="alert"
        className="mt-6 rounded-lg border border-red-400/20 bg-red-400/[.06] p-6 text-sm text-red-200"
      >
        We couldn&apos;t load this player. {detail.error?.message}
      </div>
    );
  const selectedSeason = scope.team.league.season;

  const factualSources = sources.filter((document) =>
    ["espn", "fantasypros", "reddit"].includes(document.source),
  );
  const bySource = factualSources.reduce<Record<string, SourceDocument[]>>(
    (groups, document) => {
      (groups[document.source] ||= []).push(document);
      return groups;
    },
    {},
  );
  const currentRanks = Array.from(
    (rankings?.items || []).reduce((items, ranking) => {
      const key = `${ranking.source}:${ranking.ranking_type}:${ranking.scoring_format}`;
      if (!items.has(key)) items.set(key, ranking);
      return items;
    }, new Map<string, Ranking>()).values(),
  ).filter((ranking) =>
    ["current_draft_rank", "expert_consensus_rank", "projected_position_rank"].includes(ranking.ranking_type),
  ).sort((left, right) => ["espn", "fantasypros", "fftoday"].indexOf(left.source) - ["espn", "fantasypros", "fftoday"].indexOf(right.source));

  return (
    <div className="mt-6 space-y-5">
      <header className="panel relative overflow-hidden rounded-lg p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-[#b7f34a]/[.06] blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#b7f34a]">
              <span>{player.position || "NFL"}</span>
              <span className="text-[#4f5a54]">·</span>
              <span>{player.nfl_team || "Free agent"}</span>
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-.045em] text-white sm:text-5xl">
              {player.name}
            </h1>
            <p className="mt-3 text-sm text-[#78847e]">
              Cross-source player file · {selectedSeason} season
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/[.08] bg-black/20 px-3 py-2 text-xs text-[#9da7a2]">
            <span
              className={`size-2 rounded-full ${latest?.injury_status ? "bg-amber-300" : "bg-[#b7f34a]"}`}
            />
            {latest?.injury_status || "No injury designation"}
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="panel rounded-lg p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#b7f34a]">{selectedSeason} cumulative projection</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-white">{number(projections?.projected_total_points)}</p>
          <p className="mt-2 text-xs text-[#65716b]">Simple average of {projections?.source_count || 0} compatible full-PPR sources</p>
        </div>
        <div className="panel rounded-lg p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#65716b]">{selectedSeason - 1} completed result</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-white">{latest?.position_rank == null ? "—" : `${player.position} #${latest.position_rank}`}</p>
          <p className="mt-2 text-xs text-[#65716b]">Observed ESPN positional finish—not a current projection</p>
        </div>
        <div className="panel rounded-lg p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#65716b]">Current availability signal</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-white">{latest?.percent_owned == null ? "—" : `${number(latest.percent_owned)}%`}</p>
          <p className="mt-2 text-xs text-[#65716b]">Rostered across ESPN leagues · {date(latest?.fetched_at || null)}</p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="panel overflow-hidden rounded-lg">
          <div className="border-b border-white/[.07] p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#b7f34a]">Projection consensus</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Expected full-season PPR points</h2>
            <p className="mt-2 text-sm leading-6 text-[#78847e]">A simple mean of compatible cumulative projections. This is not accuracy-weighted.</p>
            <div className="mt-5 flex items-end gap-5">
              <div><p className="font-mono text-4xl font-semibold text-white">{number(projections?.projected_total_points)}</p><p className="mt-1 text-xs text-[#65716b]">season total</p></div>
              <div className="border-l border-white/[.08] pl-5"><p className="font-mono text-2xl font-semibold text-[#c7cfca]">{number(projections?.projected_average_points)}</p><p className="mt-1 text-xs text-[#65716b]">per game · total ÷ {projections?.games_denominator || 17}</p></div>
            </div>
          </div>
          <div className="divide-y divide-white/[.06]">
            {projections?.sources.map((projection) => (
              <div key={projection.source} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <div><p className="text-sm font-medium text-white">{sourceNames[projection.source] || projection.source}</p><p className="mt-1 text-[10px] text-[#58635d]">Updated {date(projection.source_updated_at || projection.fetched_at)}</p></div>
                <div className="text-right"><p className="font-mono text-lg font-semibold text-white">{number(projection.projected_total_points)}</p><p className="text-[10px] text-[#65716b]">projected points</p></div>
              </div>
            ))}
            {!projections?.sources.length && <p className="px-6 py-8 text-sm text-[#65716b]">No compatible current projections.</p>}
          </div>
        </div>

        <div className="panel overflow-hidden rounded-lg">
          <div className="border-b border-white/[.07] p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#b7f34a]">Source rankings</p>
            <h2 className="mt-2 text-xl font-semibold text-white">How sources order the player</h2>
            <p className="mt-2 text-sm leading-6 text-[#78847e]">Lower is better. Overall and positional ranks are different measures and are never averaged together.</p>
            <div className="mt-5 rounded-md border border-white/[.07] bg-black/15 p-4">
              <p className="text-[10px] uppercase tracking-[.14em] text-[#65716b]">Comparable overall PPR consensus</p>
              <p className="mt-1 font-mono text-3xl font-semibold text-white">{rankings?.summary.average == null ? "—" : `#${number(rankings.summary.average)}`}</p>
              <p className="mt-1 text-[10px] text-[#58635d]">Simple mean of the latest {rankings?.summary.source_count || 0} overall ranks</p>
            </div>
          </div>
          <div className="divide-y divide-white/[.06]">
            {currentRanks.map((ranking) => (
              <div key={`${ranking.source}:${ranking.ranking_type}`} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <div>
                  <a href={sourceLinks[ranking.source]} target="_blank" rel="noreferrer" className="text-sm font-medium text-white hover:text-[#b7f34a]">{sourceNames[ranking.source] || ranking.source} ↗</a>
                  <p className="mt-1 text-[10px] text-[#58635d]">{ranking.ranking_type === "expert_consensus_rank" ? "Expert consensus draft rank" : ranking.ranking_type === "projected_position_rank" ? "Projection-derived positional rank" : "Platform PPR draft rank"} · {date(ranking.fetched_at)}</p>
                </div>
                <div className="text-right font-mono text-sm text-white">
                  {ranking.overall_rank != null && <p>Overall #{number(ranking.overall_rank, 0)}</p>}
                  {ranking.position_rank != null && <p className={ranking.overall_rank != null ? "mt-1 text-[#9da7a2]" : ""}>{player.position} #{number(ranking.position_rank, 0)}</p>}
                </div>
              </div>
            ))}
            {!currentRanks.length && <p className="px-6 py-8 text-sm text-[#65716b]">No current source rankings.</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel overflow-hidden rounded-lg">
          <div className="border-b border-white/[.07] px-5 py-5 sm:px-6">
            <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#b7f34a]">
              Source intelligence
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              What every source is saying
            </h2>
            <p className="mt-2 text-sm text-[#78847e]">
              Raw source material is kept separate and labeled. Expand an item
              to read more.
            </p>
          </div>
          <div className="divide-y divide-white/[.06]">
            {Object.entries(bySource).map(([source, documents]) => (
              <div key={source} className="p-5 sm:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-white">
                    {sourceNames[source] || source}
                  </h3>
                  <span className="rounded-full bg-white/[.05] px-2.5 py-1 text-[10px] text-[#78847e]">
                    {documents.length}{" "}
                    {documents.length === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="space-y-3">
                  {documents.slice(0, 5).map((document) => (
                    <details
                      key={document.id}
                      className="group rounded-md border border-white/[.07] bg-black/15 p-4"
                    >
                      <summary className="cursor-pointer list-none text-sm font-medium text-[#c6ceca]">
                        <span className="flex items-start justify-between gap-4">
                          <span>
                            {document.title ||
                              document.content
                                .slice(0, 120)
                                .replace(/\s+/g, " ")}
                          </span>
                          <span className="text-[#65716b] transition group-open:rotate-90">
                            →
                          </span>
                        </span>
                        <span className="mt-2 block text-[10px] font-normal text-[#58635d]">
                          Published {date(document.published_at)} · fetched{" "}
                          {date(document.fetched_at)}
                        </span>
                      </summary>
                      <p className="mt-4 whitespace-pre-wrap border-t border-white/[.06] pt-4 text-sm leading-6 text-[#9da7a2]">
                        {document.content}
                      </p>
                      {document.source_url && (
                        <a
                          href={document.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring mt-4 inline-flex rounded text-xs font-medium text-[#b7f34a] hover:underline"
                        >
                          Open original ↗
                        </a>
                      )}
                    </details>
                  ))}
                </div>
              </div>
            ))}
            {!factualSources.length && (
              <div className="px-6 py-14 text-center text-sm text-[#78847e]">
                No source documents have been collected for this player yet.
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="panel rounded-lg p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#65716b]">
              How to read this page
            </p>
            <dl className="mt-4 space-y-4 text-xs leading-5">
              <div><dt className="font-medium text-white">Projection</dt><dd className="mt-1 text-[#78847e]">Estimated future fantasy points. Sources can disagree.</dd></div>
              <div><dt className="font-medium text-white">Ranking</dt><dd className="mt-1 text-[#78847e]">A player&apos;s order relative to others. Lower is better.</dd></div>
              <div><dt className="font-medium text-white">Completed result</dt><dd className="mt-1 text-[#78847e]">Observed prior-season performance, not an estimate.</dd></div>
            </dl>
            <p className="mt-4 border-t border-white/[.06] pt-4 text-[10px] leading-4 text-[#58635d]">Current consensus values are transparent simple averages. We do not yet have enough validated historical evidence to label one provider the most accurate.</p>
          </section>
          <section className="panel rounded-lg p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[.17em] text-[#65716b]">
              {selectedSeason} facts
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ["Actual points", number(latest?.total_points)],
                ["Average / game", number(latest?.average_points)],
                [
                  "Started",
                  latest?.percent_started == null
                    ? "—"
                    : `${number(latest.percent_started)}%`,
                ],
                ["Last refreshed", date(latest?.fetched_at || null)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3"
                >
                  <dt className="text-[#78847e]">{label}</dt>
                  <dd className="font-mono text-[#c6ceca]">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
