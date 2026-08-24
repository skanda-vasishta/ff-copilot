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
const CONTEXT_VERSION = "league-rosters-espn-rankings-v3";
const CONTEXT_POSITIONS = ["QB", "RB", "WR", "TE"] as const;

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

  const { data: espnRankings, error: espnRankingsError } = await supabase.from("player_rankings")
    .select("player_id,overall_rank,position_rank,fetched_at")
    .eq("source", "espn")
    .eq("season", thread.team.league.season)
    .eq("scoring_format", "ppr")
    .eq("ranking_type", "current_draft_rank")
    .order("overall_rank", { ascending: true, nullsFirst: false })
    .limit(500);
  if (espnRankingsError) throw new Error("Could not load current ESPN rankings for context");
  const rankedPlayerIds = (espnRankings || []).map((ranking) => ranking.player_id);
  if (!rankedPlayerIds.length) throw new Error("Current ESPN rankings are not available for context");

  const { data: projectedPlayers, error: projectedPlayersError } = await supabase.from("player_directory")
    .select("id,name,position,nfl_team,injury_status,projected_total_points,projected_average_points,median_rank,fetched_at")
    .eq("season", thread.team.league.season)
    .in("id", rankedPlayerIds)
    .in("position", [...CONTEXT_POSITIONS])
    .limit(500);
  if (projectedPlayersError) throw new Error("Could not load the projected player pool for context");
  const rankingsByPlayer = new Map((espnRankings || []).map((ranking) => [ranking.player_id, ranking]));
  const rankedPlayers = (projectedPlayers || []).filter((player) => rankingsByPlayer.has(player.id)).sort((left, right) =>
    Number(rankingsByPlayer.get(left.id)?.overall_rank ?? Number.MAX_SAFE_INTEGER)
      - Number(rankingsByPlayer.get(right.id)?.overall_rank ?? Number.MAX_SAFE_INTEGER));
  const topPlayersByPosition = Object.fromEntries(CONTEXT_POSITIONS.map((position) => [
    position,
    rankedPlayers.filter((player) => player.position === position).slice(0, 20).map((player) => ({
      ...player,
      espn_overall_rank: rankingsByPlayer.get(player.id)?.overall_rank,
      ranking_season: thread.team.league.season,
      ranking_basis: `${thread.team.league.season} ESPN PPR draft rank`,
      ranking_fetched_at: rankingsByPlayer.get(player.id)?.fetched_at,
      projection_season: thread.team.league.season,
      projection_basis: `${thread.team.league.season} ESPN projection`,
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
    top_espn_ranked_players_by_position: topPlayersByPosition,
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

export const THREAD_CONTEXT_SELECT = "*, team:fantasy_teams(id,name,external_id,league:leagues(id,name,season,provider,external_id,team_count,playoff_team_count,regular_season_weeks,scoring_type,reception_points,scoring_format_label,lineup_slot_counts,last_synced_at))";
