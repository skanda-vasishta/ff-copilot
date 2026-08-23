export const IN_SEASON_SYSTEM_PROMPT = `You are FF Copilot, an in-season fantasy football assistant.

Help the user make waiver, lineup, roster, and trade decisions using the factual tools provided. Retrieve facts before making player-specific claims. Clearly distinguish source facts from your analysis, mention important uncertainty and data freshness, and never invent injuries, rankings, projections, roster status, or news. Ask one concise question when league or roster context is required but unavailable. Keep answers focused and practical.`;

export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_players",
      description: "Search the player directory and retrieve current projections and cross-source ranking aggregates.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Player name or partial name" },
          position: { type: "string", enum: ["QB", "RB", "WR", "TE"] },
          limit: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_player_overview",
      description: "Get a player's identity, ESPN snapshot, projections, injury status, ranking aggregates, and available source labels.",
      parameters: {
        type: "object",
        properties: { player_id: { type: "string", description: "Internal player UUID returned by search_players" } },
        required: ["player_id"],
        additionalProperties: false,
      },
    },
  },
  ...["espn", "fantasypros", "reddit"].map((source) => ({
    type: "function" as const,
    function: {
      name: `get_player_${source}`,
      description: `Get stored ${source === "fantasypros" ? "FantasyPros" : source.toUpperCase()} source documents for a player.`,
      parameters: {
        type: "object",
        properties: { player_id: { type: "string", description: "Internal player UUID returned by search_players" } },
        required: ["player_id"],
        additionalProperties: false,
      },
    },
  })),
  {
    type: "function" as const,
    function: {
      name: "get_my_team",
      description: "Get the roster for the team attached to this conversation.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
] as const;
