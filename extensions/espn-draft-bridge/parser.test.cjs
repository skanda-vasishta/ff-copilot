const assert = require("node:assert/strict");
const { decodeStrings, parseFrame } = require("./parser.js");
const { parsePickHistory } = require("./dom-parser.js");

assert.deepEqual(decodeStrings('a["{\\"type\\":\\"PING\\"}"]'), [
  '{"type":"PING"}',
]);

const direct = parseFrame(
  JSON.stringify({
    leagueId: 1662944142,
    event: {
      type: "DRAFT_PICK",
      playerId: 4430807,
      teamId: 3,
      overallPickNumber: 12,
      roundId: 2,
      roundPickNumber: 4,
    },
  }),
  "2026-08-09T00:00:00.000Z",
);
assert.deepEqual(direct.leagueIds, ["1662944142"]);
assert.equal(direct.picks.length, 1);
assert.equal(direct.picks[0].playerId, 4430807);
assert.equal(direct.picks[0].overallPickNumber, 12);

const stomp = parseFrame(
  'MESSAGE\nsubscription:0\n\n{"payload":"{\\"playerId\\":123,\\"teamId\\":2,\\"pickNumber\\":7}"}\0',
  "2026-08-09T00:00:01.000Z",
);
assert.equal(stomp.picks.length, 1);
assert.equal(stomp.picks[0].overallPickNumber, 7);

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

console.log("ESPN frame parser tests passed");
