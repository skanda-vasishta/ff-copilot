(function registerParser(root) {
  const PLAYER_KEYS = ["playerId", "playerID", "player_id"];
  const TEAM_KEYS = ["teamId", "teamID", "team_id", "nominatingTeamId"];
  const OVERALL_KEYS = [
    "overallPickNumber",
    "overallPick",
    "overall_pick_number",
    "pickNumber",
    "pick",
  ];

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function firstNumber(value, keys) {
    for (const key of keys) {
      const number = positiveNumber(value?.[key]);
      if (number != null) return number;
    }
    return null;
  }

  function decodeStrings(value, depth = 0) {
    if (depth > 5 || typeof value !== "string") return value;
    let text = value.trim().replace(/\0+$/g, "");
    if (!text) return text;

    // STOMP frames place JSON after the blank line separating headers/body.
    const bodyStart = text.indexOf("\n\n");
    if (bodyStart >= 0) text = text.slice(bodyStart + 2).replace(/\0+$/g, "");

    // SockJS wraps messages as a JSON array prefixed by `a`.
    if (text[0] === "a" && text[1] === "[") text = text.slice(1);

    if (!["{", "[", '"'].includes(text[0])) return text;
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === "string" ? decodeStrings(parsed, depth + 1) : parsed;
    } catch {
      return text;
    }
  }

  function collectDecoded(value, output, depth = 0) {
    if (depth > 12 || value == null) return;
    const decoded = typeof value === "string" ? decodeStrings(value) : value;
    if (decoded !== value) return collectDecoded(decoded, output, depth + 1);
    if (Array.isArray(decoded)) {
      for (const item of decoded) collectDecoded(item, output, depth + 1);
      return;
    }
    if (typeof decoded !== "object") return;
    output.push(decoded);
    for (const child of Object.values(decoded))
      collectDecoded(child, output, depth + 1);
  }

  function parseFrame(frame, capturedAt) {
    const objects = [];
    collectDecoded(frame, objects);
    const leagueIds = new Set();
    const picks = [];

    for (const value of objects) {
      const leagueId = positiveNumber(
        value.leagueId ?? value.leagueID ?? value.league_id,
      );
      if (leagueId != null) leagueIds.add(String(leagueId));

      const playerId = firstNumber(value, PLAYER_KEYS);
      if (playerId == null) continue;
      const overallPickNumber = firstNumber(value, OVERALL_KEYS);
      const teamId = firstNumber(value, TEAM_KEYS);
      // Requiring an overall pick number prevents player-pool and roster
      // payloads from being mistaken for completed selections.
      if (overallPickNumber == null) continue;

      picks.push({
        playerId,
        teamId,
        overallPickNumber,
        roundId: positiveNumber(value.roundId ?? value.round),
        roundPickNumber: positiveNumber(
          value.roundPickNumber ?? value.roundPick ?? value.round_pick_number,
        ),
        capturedAt,
      });
    }

    const unique = new Map();
    for (const pick of picks) {
      const key = pick.overallPickNumber
        ? `overall:${pick.overallPickNumber}`
        : `player:${pick.playerId}`;
      unique.set(key, pick);
    }
    return { leagueIds: [...leagueIds], picks: [...unique.values()] };
  }

  const api = { decodeStrings, parseFrame };
  root.FFCopilotEspnParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
