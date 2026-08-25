import { api, queryString } from "@/lib/api";
import type { AgentThread, ToolCallPart } from "@ff-copilot/agent-runtime";
import { validateToolInput } from "@/features/copilot/harness";

type PlayerDetail = {
  player: Record<string, unknown>;
  snapshots: Record<string, unknown>[];
  projections: Record<string, unknown>;
  rankings: { items: Record<string, unknown>[]; summary: Record<string, unknown> };
  sources: Array<Record<string, unknown> & { source: string }>;
};

export async function executeTool(call: ToolCallPart, thread: AgentThread) {
  const input = validateToolInput(call.name, call.input) as Record<string, unknown>;
  const season = thread.season || 2026;
  if (call.name === "search_players") {
    const result = await api<{ items: Array<Record<string, unknown>>; [key: string]: unknown }>(`/v1/players?${queryString({
      search: String(input.query || ""),
      position: typeof input.position === "string" ? input.position : undefined,
      season,
      page_size: Math.min(Number(input.limit) || 8, 20),
      sort: "projected_total_points",
      direction: "desc",
    })}`);
    return {
      ...result,
      items: result.items.map(({ average_rank: _average, median_rank, minimum_rank: _minimum, maximum_rank: _maximum, ...player }) => ({
        ...player,
        projection_season: season,
        projection_basis: `${season} full-PPR cumulative projection consensus from all available compatible sources`,
        previous_season_position_finish: median_rank,
        ranking_basis: `${season - 1} ESPN positional finish; not a ${season} draft or projection rank`,
      })),
    };
  }
  if (call.name === "get_player_overview") {
    const detail = await api<PlayerDetail>(`/v1/players/${String(input.player_id)}/detail?season=${season}`);
    const snapshot = detail.snapshots.find((candidate) => candidate.source === "espn");
    return {
      player: detail.player,
      projection_consensus: detail.projections,
      latest_snapshot: snapshot ? {
        season: snapshot.season,
        week: snapshot.week,
        source: snapshot.source,
        position_rank: snapshot.position_rank,
        position_rank_basis: `${season - 1} ESPN positional finish; not a ${season} draft or projection rank`,
        injury_status: snapshot.injury_status,
        total_points: snapshot.total_points,
        average_points: snapshot.average_points,
        projection_season: snapshot.season,
        projection_basis: `${snapshot.season} projection values are provided in projection_consensus; ESPN snapshot values are not the consensus`,
        percent_owned: snapshot.percent_owned,
        percent_started: snapshot.percent_started,
        fetched_at: snapshot.fetched_at,
      } : null,
      ranking_summary: detail.rankings.summary,
      rankings: detail.rankings.items.slice(0, 20).map((ranking) => ({
        source: ranking.source,
        scoring_format: ranking.scoring_format,
        ranking_type: ranking.ranking_type,
        overall_rank: ranking.overall_rank,
        position_rank: ranking.position_rank,
        fetched_at: ranking.fetched_at,
        basis: ranking.ranking_type === "previous_season_position_finish" || ranking.ranking_type === "position"
          ? `${season - 1} ESPN positional finish; not a ${season} draft or projection rank`
          : `${season} season-to-date rank`,
      })),
      sources: [...new Set(detail.sources.map((source) => source.source))],
    };
  }
  const sourceMatch = call.name.match(/^get_player_(espn|fantasypros|reddit)$/);
  if (sourceMatch) {
    const sources = await api<Array<Record<string, unknown> & { source: string }>>(`/v1/players/${String(input.player_id)}/sources`);
    return sources.filter((document) => document.source.toLowerCase() === sourceMatch[1]).slice(0, 6).map((document) => ({
      title: document.title,
      content: typeof document.content === "string" ? document.content.slice(0, 6000) : "",
      source_url: document.source_url,
      published_at: document.published_at,
      fetched_at: document.fetched_at,
    }));
  }
  if (call.name === "get_my_team") {
    if (!thread.team_id) return { error: "No team is attached to this conversation." };
    const roster = await api<{ snapshot: Record<string, unknown> | null; players: unknown[] }>(`/v1/teams/${thread.team_id}/roster`);
    return {
      snapshot: roster.snapshot ? {
        season: roster.snapshot.season,
        week: roster.snapshot.week,
        fetched_at: roster.snapshot.fetched_at,
      } : null,
      players: roster.players,
    };
  }
  if (call.name === "get_league_standings") {
    if (!thread.league_id) return { error: "No league is attached to this conversation." };
    const teams = await api<Array<Record<string, unknown>>>(`/v1/leagues/${thread.league_id}/teams`);
    return teams.sort((a, b) => Number(a.standing || 999) - Number(b.standing || 999));
  }
  if (call.name === "get_league_team_roster") {
    if (!thread.league_id) return { error: "No league is attached to this conversation." };
    const teamId = String(input.team_id || "");
    const teams = await api<Array<Record<string, unknown>>>(`/v1/leagues/${thread.league_id}/teams`);
    const team = teams.find((candidate) => candidate.id === teamId);
    if (!team) return { error: "That team is not in this conversation's league." };
    const roster = await api<{ snapshot: Record<string, unknown> | null; players: unknown[] }>(`/v1/teams/${teamId}/roster`);
    return { team, snapshot: roster.snapshot, players: roster.players };
  }
  if (call.name === "get_league_free_agents") {
    if (!thread.league_id) return { error: "No league is attached to this conversation." };
    const result = await api<{ items: Array<Record<string, unknown>>; [key: string]: unknown }>(`/v1/leagues/${thread.league_id}/free-agents?${queryString({
      season,
      position: typeof input.position === "string" ? input.position : undefined,
      limit: Math.min(Number(input.limit) || 25, 50),
      sort: typeof input.sort === "string" ? input.sort : "projected_total_points",
    })}`);
    return {
      ...result,
      items: result.items.map(({ average_rank: _average, median_rank, minimum_rank: _minimum, maximum_rank: _maximum, ...player }) => ({
        ...player,
        projection_season: season,
        projection_basis: `${season} full-PPR cumulative projection consensus from all available compatible sources`,
        previous_season_position_finish: median_rank,
        ranking_basis: `${season - 1} ESPN positional finish; not a ${season} draft or projection rank`,
      })),
    };
  }
  if (call.name === "get_league_draft_history") {
    if (!thread.league_id) return { error: "No league is attached to this conversation." };
    return api(`/v1/leagues/${thread.league_id}/draft-picks?${queryString({
      season: typeof input.season === "number" ? input.season : undefined,
      round_number: typeof input.round_number === "number" ? input.round_number : undefined,
      team_name: typeof input.team_name === "string" ? input.team_name : undefined,
      position: typeof input.position === "string" ? input.position : undefined,
      overall_pick: typeof input.overall_pick === "number" ? input.overall_pick : undefined,
      window: typeof input.window === "number" ? input.window : 3,
      limit: typeof input.limit === "number" ? input.limit : 200,
    })}`);
  }
  throw new Error(`Unknown tool: ${call.name}`);
}
