const assert = require("node:assert/strict");
const { parsePickHistory } = require("./dom-parser.js");

const visibleHistory = parsePickHistory(
  "Picks\nJahmyr Gibbs / DET RB R1, P1 - Skanda's Smart Team\n" +
    "Bijan Robinson / ATL RB R1, P2 - Team 2\n" +
    "Amon-Ra St. Brown / DET WR R2, P3 - Team 6",
  "2026-08-09T00:00:02.000Z",
);
assert.equal(visibleHistory.length, 3);
assert.deepEqual(visibleHistory[2], {
  playerName: "Amon-Ra St. Brown",
  nflTeam: "DET",
  position: "WR",
  roundId: 2,
  roundPickNumber: 3,
  fantasyTeamName: "Team 6",
  capturedAt: "2026-08-09T00:00:02.000Z",
});

console.log("ESPN DOM parser tests passed");
