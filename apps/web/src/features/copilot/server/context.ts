import type { SupabaseClient } from "@supabase/supabase-js";

type League = {
  id: string;
  name: string | null;
  season: number;
  provider: string;
  external_id: string;
  team_count: number | null;
  playoff_team_count: number | null;
  regular_season_weeks: number | null;
  scoring_type: string | null;
  reception_points: number | null;
  scoring_format_label: string | null;
  lineup_slot_counts: Record<string, number>;
  league_settings: Record<string, unknown>;
  last_synced_at: string | null;
};

export type ContextThread = {
  id: string;
  team_id: string;
  league_id: string;
  context_snapshot: Record<string, unknown> | null;
  context_date_utc: string | null;
  context_refreshed_at: string | null;
  team: { id: string; name: string; external_id: string; league: League };
};

const utcDate = () => new Date().toISOString().slice(0, 10);
const CONTEXT_VERSION = "league-rosters-consensus-rankings-v8";
const CONTEXT_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const CONTEXT_PLAYERS_PER_POSITION = 30;

const present = (value: unknown) => value !== null && value !== undefined && value !== "";

export function formatThreadContext(snapshot: Record<string, unknown>) {
  const league = snapshot.league as Record<string, unknown>;
  const selectedTeam = snapshot.selected_team as Record<string, unknown>;
  const teams = (snapshot.teams || []) as Array<Record<string, unknown>>;
  const rankings = snapshot.top_consensus_ranked_players_by_position as Record<string, Array<Record<string, unknown>>>;
  const leagueSettings = (league.league_settings || {}) as Record<string, unknown>;
  const draftSettings = (leagueSettings.draft_settings || {}) as Record<string, unknown>;
  const pickOrder = Array.isArray(draftSettings.pick_order) ? draftSettings.pick_order.map(String) : [];
  const pickAssignments = Array.isArray(draftSettings.pick_assignments)
    ? draftSettings.pick_assignments as Array<Record<string, unknown>> : [];
  const teamByExternalId = new Map(teams.map((team) => [String(team.external_id), team]));
  const selectedTeamDetails = teams.find((team) => team.id === selectedTeam.id);
  const selectedExternalTeamId = String(selectedTeamDetails?.external_id || "");
  const roundCount = Math.max(0, ...pickAssignments.map((pick) => Number(pick.round || 0)));
  const userPicks = pickAssignments.filter((pick) => String(pick.team_external_id) === selectedExternalTeamId);
  const lineup = Object.entries((league.lineup_slot_counts || {}) as Record<string, unknown>)
    .filter(([, count]) => Number(count) > 0)
    .map(([slot, count]) => `${count} ${slot}`)
    .join(", ");
  const lines = [
    "# LEAGUE CONTEXT (authoritative daily snapshot)",
    `Updated: ${String(snapshot.refreshed_at)}`,
    "",
    "## League",
    `Name: ${String(league.name || "Unnamed league")}`,
    `Season: ${String(league.season)}`,
    `Scoring: ${String(league.scoring_format_label || league.scoring_type || "unknown")}${present(league.reception_points) ? ` (${String(league.reception_points)} points per reception)` : ""}`,
    `Teams: ${String(league.team_count || teams.length)}; playoffs: ${String(league.playoff_team_count || "unknown")}; regular-season weeks: ${String(league.regular_season_weeks || "unknown")}`,
    `Starting lineup and bench: ${lineup || "not available"}`,
    `Selected user team: ${String(selectedTeam.name)} (team_id: ${String(selectedTeam.id)})`,
  ];

  if (pickOrder.length) {
    const draftType = String(draftSettings.type || "unknown").toLowerCase();
    const orderType = String(draftSettings.order_type || "unknown").toLowerCase();
    const clock = present(draftSettings.time_per_selection) ? `${String(draftSettings.time_per_selection)} seconds per pick` : "pick clock unavailable";
    const status = draftSettings.in_progress ? "in progress" : draftSettings.drafted ? "completed" : "scheduled / pre-draft";
    lines.push(
      "",
      `## ${String(league.season)} ESPN draft order`,
      `Draft format: ${String(league.team_count || teams.length)}-team, ${roundCount || "unknown-round"} ${draftType} draft. ${draftType === "snake" ? "The selection order reverses every round." : "Do not assume the order reverses between rounds."}`,
      `Order configuration: ${orderType}; status: ${status}; ${clock}. Source: ESPN league settings, synced ${String(league.last_synced_at || snapshot.refreshed_at)}.`,
    );
    for (const [index, externalTeamId] of pickOrder.entries()) {
      const orderedTeam = teamByExternalId.get(externalTeamId);
      lines.push(`${index + 1}. ${String(orderedTeam?.name || `ESPN team ${externalTeamId}`)}${orderedTeam?.id === selectedTeam.id ? " (YOUR TEAM)" : ""} | team_id ${String(orderedTeam?.id || "unknown")} | ESPN team ${externalTeamId}`);
    }
    lines.push("", `### All picks currently assigned to ${String(selectedTeam.name)}`);
    if (userPicks.length) {
      lines.push(userPicks.map((pick) => `Round ${String(pick.round)}, pick ${String(pick.round_pick)} (overall ${String(pick.overall_pick)})`).join("; "));
    } else {
      lines.push("No pick assignments were present in ESPN's latest draft grid.");
    }
  } else {
    lines.push("", `## ${String(league.season)} ESPN draft order`, "Not available in the latest stored ESPN league settings. Do not infer it from a previous season.");
  }

  lines.push(
    "",
    "## Player ownership and rosters",
    "These ownership assignments are authoritative. Never recommend that a team acquire a player already on that same team.",
  );

  for (const team of [...teams].sort((left, right) => Number(Boolean(right.is_user_team)) - Number(Boolean(left.is_user_team)))) {
    const roster = (team.roster || []) as Array<Record<string, unknown>>;
    const record = `${String(team.wins ?? 0)}-${String(team.losses ?? 0)}${Number(team.ties || 0) ? `-${String(team.ties)}` : ""}`;
    lines.push("", `### ${team.is_user_team ? "YOUR TEAM — " : ""}${String(team.name)} (team_id: ${String(team.id)})`, `Record: ${record}; standing: ${String(team.standing || "preseason/unranked")}`);
    if (!roster.length) lines.push("Roster: empty (pre-draft or unavailable)");
    else for (const player of roster) lines.push(`- ${String(player.name)} | ${String(player.position || "?")} ${String(player.nfl_team || "FA")} | slot ${String(player.lineup_slot || "unknown")} | player_id ${String(player.player_id)}`);
  }

  lines.push("", `## ${String(league.season)} full-PPR consensus rankings`, `Top ${CONTEXT_PLAYERS_PER_POSITION} within each position, ordered by a simple average of every compatible current positional rank. ESPN is a platform draft rank, FantasyPros is expert consensus rank, and FFToday is projection-derived positional rank. Projected points separately average every compatible full-season PPR projection source.`);
  for (const position of CONTEXT_POSITIONS) {
    lines.push("", `### ${position}`);
    const players = rankings?.[position] || [];
    for (const [index, player] of players.entries()) {
      const facts = [
        `position list #${index + 1}`,
        present(player.consensus_position_rank) ? `consensus ${position}${Number(player.consensus_position_rank).toFixed(1)}` : null,
        present(player.consensus_overall_rank) ? `overall consensus #${Number(player.consensus_overall_rank).toFixed(1)}` : null,
        Array.isArray(player.ranking_sources) ? `source ranks: ${(player.ranking_sources as Array<Record<string, unknown>>).map((source) => `${String(source.source)} ${position}${String(source.position_rank ?? "?")}${present(source.overall_rank) ? ` / overall ${String(source.overall_rank)}` : ""}`).join(", ")}` : null,
        present(player.projected_total_points) ? `${String(player.projected_total_points)} consensus projected points (${String(player.projection_source_count || 0)} sources)` : null,
        present(player.injury_status) && player.injury_status !== "ACTIVE" ? `injury: ${String(player.injury_status)}` : null,
      ].filter(Boolean).join("; ");
      lines.push(`- ${String(player.name)} (${String(player.nfl_team || "FA")}) | ${facts} | player_id ${String(player.id)}`);
    }
  }
  return lines.join("\n");
}

export async function ensureThreadContext(supabase: SupabaseClient, thread: ContextThread, force = false) {
  if (!force && thread.context_snapshot?.context_version === CONTEXT_VERSION && thread.context_date_utc === utcDate()) return thread.context_snapshot;

  const { data: teams, error: teamsError } = await supabase.from("fantasy_teams")
    .select("id,name,external_id,wins,losses,ties,points_for,points_against,standing,final_standing,playoff_pct")
    .eq("league_id", thread.league_id)
    .order("name");
  if (teamsError) throw new Error("Could not load league teams for context");
  const teamIds = (teams || []).map((team) => team.id);

  const snapshots = teamIds.length ? await supabase.from("roster_snapshots")
    .select("id,team_id,season,week,fetched_at")
    .in("team_id", teamIds)
    .eq("season", thread.team.league.season)
    .order("fetched_at", { ascending: false }) : { data: [], error: null };
  if (snapshots.error) throw new Error("Could not load roster snapshots for context");
  const latestByTeam = new Map<string, { id: string; team_id: string; season: number; week: number | null; fetched_at: string }>();
  for (const snapshot of snapshots.data || []) if (!latestByTeam.has(snapshot.team_id)) latestByTeam.set(snapshot.team_id, snapshot);
  const snapshotIds = [...latestByTeam.values()].map((snapshot) => snapshot.id);

  const rosterRows = snapshotIds.length ? await supabase.from("roster_players")
    .select("roster_snapshot_id,lineup_slot,player:players(id,name,position,nfl_team,active)")
    .in("roster_snapshot_id", snapshotIds) : { data: [], error: null };
  if (rosterRows.error) throw new Error("Could not load roster players for context");
  const rosters = new Map<string, Array<Record<string, unknown>>>();
  const teamBySnapshot = new Map([...latestByTeam.entries()].map(([teamId, snapshot]) => [snapshot.id, teamId]));
  for (const row of rosterRows.data || []) {
    const teamId = teamBySnapshot.get(row.roster_snapshot_id);
    if (!teamId) continue;
    const player = row.player as unknown as { id: string; name: string; position: string | null; nfl_team: string | null; active: boolean } | null;
    if (!player) continue;
    const entries = rosters.get(teamId) || [];
    entries.push({ player_id: player.id, name: player.name, position: player.position, nfl_team: player.nfl_team, lineup_slot: row.lineup_slot });
    rosters.set(teamId, entries);
  }

  const rankingQueries = await Promise.all([
    ["espn", "current_draft_rank"], ["fantasypros", "expert_consensus_rank"], ["fftoday", "projected_position_rank"],
  ].map(([source, rankingType]) => supabase.from("player_rankings")
    .select("player_id,source,ranking_type,overall_rank,position_rank,fetched_at")
    .eq("season", thread.team.league.season).eq("source", source)
    .eq("scoring_format", "ppr").eq("ranking_type", rankingType)
    .order("fetched_at", { ascending: false }).limit(1000)));
  const rankingQueryError = rankingQueries.find((query) => query.error)?.error;
  if (rankingQueryError) throw new Error("Could not load current consensus rankings for context");
  const currentRankings = rankingQueries.flatMap((query) => query.data || []);
  const latestRankingByPlayerSource = new Map<string, NonNullable<typeof currentRankings>[number]>();
  for (const ranking of currentRankings || []) {
    const key = `${ranking.player_id}:${ranking.source}`;
    if (!latestRankingByPlayerSource.has(key)) latestRankingByPlayerSource.set(key, ranking);
  }
  const rankingsByPlayer = new Map<string, Array<NonNullable<typeof currentRankings>[number]>>();
  for (const ranking of latestRankingByPlayerSource.values()) {
    const rows = rankingsByPlayer.get(ranking.player_id) || [];
    rows.push(ranking);
    rankingsByPlayer.set(ranking.player_id, rows);
  }
  const rankedPlayerIds = [...rankingsByPlayer.keys()];
  if (!rankedPlayerIds.length) throw new Error("Current consensus rankings are not available for context");

  const { data: projectedPlayers, error: projectedPlayersError } = await supabase.from("player_directory")
    .select("id,name,position,nfl_team,injury_status,projected_total_points,projected_average_points,projection_source_count,projection_sources,median_rank,fetched_at")
    .eq("season", thread.team.league.season)
    .in("id", rankedPlayerIds)
    .in("position", [...CONTEXT_POSITIONS])
    .limit(500);
  if (projectedPlayersError) throw new Error("Could not load the projected player pool for context");
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const rankedPlayers = (projectedPlayers || []).filter((player) => rankingsByPlayer.has(player.id)).map((player) => {
    const sourceRanks = rankingsByPlayer.get(player.id) || [];
    const positionRanks = sourceRanks.map((ranking) => ranking.position_rank).filter((rank): rank is number => rank != null);
    const overallRanks = sourceRanks.map((ranking) => ranking.overall_rank).filter((rank): rank is number => rank != null);
    return {
      ...player,
      consensus_position_rank: positionRanks.length ? average(positionRanks) : null,
      consensus_overall_rank: overallRanks.length ? average(overallRanks) : null,
      ranking_sources: sourceRanks.map((ranking) => ({
        source: ranking.source, ranking_type: ranking.ranking_type,
        overall_rank: ranking.overall_rank, position_rank: ranking.position_rank,
        fetched_at: ranking.fetched_at,
      })),
    };
  }).sort((left, right) => Number(left.consensus_position_rank ?? Number.MAX_SAFE_INTEGER) - Number(right.consensus_position_rank ?? Number.MAX_SAFE_INTEGER));
  const topPlayersByPosition = Object.fromEntries(CONTEXT_POSITIONS.map((position) => [
    position,
    rankedPlayers.filter((player) => player.position === position).slice(0, CONTEXT_PLAYERS_PER_POSITION).map((player) => ({
      ...player,
      ranking_season: thread.team.league.season,
      ranking_basis: `${thread.team.league.season} full-PPR positional consensus across all compatible current sources`,
      projection_season: thread.team.league.season,
      projection_basis: `${thread.team.league.season} full-PPR cumulative projection consensus from all available compatible sources`,
      previous_season_position_finish: player.median_rank,
      previous_season_finish_basis: `${thread.team.league.season - 1} ESPN positional finish; not a ${thread.team.league.season} projection or consensus rank`,
    })),
  ]));

  const refreshedAt = new Date().toISOString();
  const snapshot = {
    context_version: CONTEXT_VERSION,
    context_date_utc: utcDate(),
    refreshed_at: refreshedAt,
    selected_team: { id: thread.team.id, name: thread.team.name },
    league: thread.team.league,
    top_consensus_ranked_players_by_position: topPlayersByPosition,
    teams: (teams || []).map((team) => ({
      ...team,
      is_user_team: team.id === thread.team_id,
      roster_snapshot: latestByTeam.get(team.id) || null,
      roster: rosters.get(team.id) || [],
    })),
  };
  const { error: saveError } = await supabase.from("agent_threads").update({
    context_snapshot: snapshot,
    context_date_utc: utcDate(),
    context_refreshed_at: refreshedAt,
  }).eq("id", thread.id);
  if (saveError) throw new Error("Could not persist the conversation context");
  return snapshot;
}

export const THREAD_CONTEXT_SELECT = "*, team:fantasy_teams(id,name,external_id,league:leagues(id,name,season,provider,external_id,team_count,playoff_team_count,regular_season_weeks,scoring_type,reception_points,scoring_format_label,lineup_slot_counts,league_settings,last_synced_at))";
