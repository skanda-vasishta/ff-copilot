import { z } from "zod";

export const IN_SEASON_SYSTEM_PROMPT = `You are FF Copilot, an in-season fantasy football assistant.

Help the user make waiver, lineup, roster, and trade decisions using the factual tools provided. Retrieve facts before making player-specific claims. Clearly distinguish source facts from your analysis, mention important uncertainty and data freshness, and never invent injuries, rankings, projections, roster status, or news. Ask one concise question when league or roster context is required but unavailable. Keep answers focused and practical.`;

const playerId = z.uuid().describe("Internal player UUID returned by search_players or another player tool");
const noInput = z.object({}).strict();

export const TOOL_REGISTRY = {
  search_players: {
    description: "Find NFL fantasy players by full or partial name. Returns internal player IDs plus current projection and cross-source ranking summaries. Use this before player-specific tools when an ID is unknown.",
    schema: z.object({
      query: z.string().trim().min(1).describe("Player name or partial name, such as 'Bijan Robinson' or 'Bijan'"),
      position: z.enum(["QB", "RB", "WR", "TE"]).optional().describe("Optional fantasy position filter"),
      limit: z.number().int().min(1).max(20).optional().describe("Maximum results; defaults to 8"),
    }).strict(),
  },
  get_player_overview: {
    description: "Retrieve one player's factual overview: identity, latest ESPN statistical snapshot, projections, injury status, ownership, individual rankings, aggregate rankings, and which news sources are available. Use source-specific tools for the underlying article text.",
    schema: z.object({ player_id: playerId }).strict(),
  },
  get_player_espn: {
    description: "Retrieve stored ESPN news and analysis documents for one player, including source URL and publication/fetch timestamps. This returns provider text, not a generated summary.",
    schema: z.object({ player_id: playerId }).strict(),
  },
  get_player_fantasypros: {
    description: "Retrieve stored FantasyPros notes for one player, including source URL and publication/fetch timestamps. This returns provider text, not a generated summary.",
    schema: z.object({ player_id: playerId }).strict(),
  },
  get_player_reddit: {
    description: "Retrieve recent stored r/fantasyfootball posts and selected comments associated with one player. Treat community opinions as anecdotal and mention their source and freshness.",
    schema: z.object({ player_id: playerId }).strict(),
  },
  get_my_team: {
    description: "Retrieve the latest stored roster snapshot for the team permanently attached to this conversation. Use for lineup, roster construction, waiver, and trade analysis.",
    schema: noInput,
  },
  get_league_standings: {
    description: "Retrieve every team in this conversation's league with records, points, and standing. Returns team_id values that can be passed to get_league_team_roster.",
    schema: noInput,
  },
  get_league_team_roster: {
    description: "Retrieve the latest stored roster for one other team in this conversation's league. The server verifies that the requested team belongs to the thread's locked league.",
    schema: z.object({ team_id: z.uuid().describe("Fantasy team UUID returned by get_league_standings") }).strict(),
  },
  get_league_free_agents: {
    description: "Retrieve players who are absent from every team's latest stored roster in this conversation's ESPN league. Use this for waiver, add/drop, and best-available-player questions. Results include projections, injuries, ranking summaries, and the roster snapshot timestamp that availability is based on; never infer league availability from search_players.",
    schema: z.object({
      position: z.enum(["QB", "RB", "WR", "TE"]).optional().describe("Optional position filter"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum results; defaults to 25"),
      sort: z.enum(["median_rank", "average_rank", "projected_total_points", "name"]).optional().describe("How to order available players; defaults to best median rank"),
    }).strict(),
  },
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;

export const AGENT_TOOLS = Object.entries(TOOL_REGISTRY).map(([name, definition]) => ({
  type: "function" as const,
  function: {
    name,
    description: definition.description,
    parameters: z.toJSONSchema(definition.schema),
  },
}));

export function validateToolInput(name: string, input: unknown) {
  const definition = TOOL_REGISTRY[name as ToolName];
  if (!definition) throw new Error(`Unknown tool: ${name}`);
  return definition.schema.parse(input);
}
