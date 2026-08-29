const assert = require("node:assert/strict");
const { parseDraftBoard, parsePickHistory } = require("./dom-parser.js");

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

function element({ style = "", text = "", selectors = {} }) {
  return {
    textContent: text,
    getAttribute(name) { return name === "style" ? style : null; },
    querySelector(selector) { return selectors[selector] || null; },
  };
}

const headers = [
  element({ style: "grid-area: 1 / 1", text: "Team One" }),
  element({ style: "grid-area: 1 / 2", text: "Team Two" }),
];
function pickCell(style, roundPick, first, last, nflTeam, position) {
  return element({
    style,
    selectors: {
      ".roundPick": element({ text: roundPick }),
      ".playerFirstName": element({ text: first }),
      ".playerLastName": element({ text: last }),
      ".playerProTeam": element({ text: nflTeam }),
      ".positionPill": element({ text: position }),
    },
  });
}
const board = {
  querySelectorAll(selector) {
    if (selector === ".draft-board-grid-header-cell") return headers;
    if (selector === ".draft-board-grid-pick-cell.completedPick") return [
      pickCell("grid-area: 1 / 1", "1.1", "Jahmyr", "Gibbs", "DET", "RB"),
      pickCell("grid-area: 2 / 1", "2.2", "Eagles", "D/ST", "PHI", "D/ST"),
    ];
    return [];
  },
};
const boardPicks = parseDraftBoard(board, "2026-08-29T00:00:00.000Z");
assert.equal(boardPicks.length, 2);
assert.deepEqual(boardPicks.map((pick) => pick.overallPickNumber), [1, 4]);
assert.equal(boardPicks[1].fantasyTeamName, "Team One");
assert.equal(boardPicks[1].playerName, "Eagles D/ST");

console.log("ESPN DOM parser tests passed");
