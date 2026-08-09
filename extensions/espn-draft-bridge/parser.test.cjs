const assert = require("node:assert/strict");
const { decodeStrings, parseFrame } = require("./parser.js");

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

console.log("ESPN frame parser tests passed");
