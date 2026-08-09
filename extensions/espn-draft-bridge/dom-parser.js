(function registerDomParser(root) {
  const PICK_LINE = /^(.+?)\s*\/\s*([A-Z]{2,4})\s+(QB|RB|WR|TE|K|D\/ST)\s+R(\d+),\s*P(\d+)\s+-\s+(.+)$/gm;

  function parsePickHistory(text, capturedAt = new Date().toISOString()) {
    const picks = [];
    let match;
    PICK_LINE.lastIndex = 0;
    while ((match = PICK_LINE.exec(text))) {
      picks.push({
        playerName: match[1].trim(),
        nflTeam: match[2],
        position: match[3],
        roundId: Number(match[4]),
        roundPickNumber: Number(match[5]),
        fantasyTeamName: match[6].trim(),
        capturedAt,
      });
    }
    return picks;
  }

  const api = { parsePickHistory };
  root.FFCopilotEspnDomParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
