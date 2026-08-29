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

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function gridColumn(element) {
    const style = element.getAttribute("style") || "";
    const match = style.match(/grid-area:\s*\d+\s*\/\s*(\d+)/i);
    return Number(match?.[1]) || null;
  }

  function parseDraftBoard(root, capturedAt = new Date().toISOString()) {
    const headers = Array.from(root.querySelectorAll(".draft-board-grid-header-cell"));
    const teamByColumn = new Map();
    headers.forEach((header, index) => {
      const column = gridColumn(header) || index + 1;
      const name = header.textContent?.trim();
      if (name) teamByColumn.set(column, name);
    });
    const teamCount = teamByColumn.size;
    if (!teamCount) return [];

    return Array.from(root.querySelectorAll(".draft-board-grid-pick-cell.completedPick"))
      .map((cell) => {
        const roundPick = cell.querySelector(".roundPick")?.textContent?.trim() || "";
        const match = roundPick.match(/^(\d+)\.(\d+)$/);
        const firstName = cell.querySelector(".playerFirstName")?.textContent?.trim() || "";
        const lastName = cell.querySelector(".playerLastName")?.textContent?.trim() || "";
        const nflTeam = cell.querySelector(".playerProTeam")?.textContent?.trim();
        const position = cell.querySelector(".positionPill")?.textContent?.trim();
        const column = gridColumn(cell);
        const fantasyTeamName = column ? teamByColumn.get(column) : null;
        if (!match || !firstName || !lastName || !nflTeam || !position || !fantasyTeamName) return null;
        const roundId = Number(match[1]);
        const roundPickNumber = Number(match[2]);
        return {
          playerName: `${firstName} ${lastName}`.trim(),
          nflTeam,
          position,
          roundId,
          roundPickNumber,
          overallPickNumber: (roundId - 1) * teamCount + roundPickNumber,
          fantasyTeamName,
          capturedAt,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.overallPickNumber - b.overallPickNumber);
  }

  function parsePickHistoryDom(root, capturedAt = new Date().toISOString(), teamNames = []) {
    const picks = [];
    const rounds = Array.from(root.querySelectorAll(".pick-history-table"));
    const teamPattern = teamNames
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|");
    const hiddenRowPattern = teamPattern
      ? new RegExp(`^\\s*(\\d+)(.+?)([A-Z]{2,4})(QB|RB|WR|TE|K|D\\/ST)(${teamPattern})`)
      : null;

    rounds.forEach((roundElement, roundIndex) => {
      const caption = roundElement.querySelector(".caption")?.textContent || "";
      const roundId = Number(caption.match(/Round\s+(\d+)/i)?.[1]) || roundIndex + 1;
      const rows = Array.from(
        roundElement.querySelectorAll(".Table__TR, [role='row'], tr"),
      );

      for (const row of rows) {
        const cells = Array.from(
          row.querySelectorAll(".Table__TD, [role='cell'], td"),
        );
        const playerLink = row.querySelector(".playerinfo__playername, a");
        let playerName = playerLink?.textContent?.trim();

        if (!playerName && hiddenRowPattern) {
          const hidden = (row.textContent || "").match(hiddenRowPattern);
          if (!hidden) continue;
          picks.push({
            playerName: hidden[2].trim(),
            nflTeam: hidden[3],
            position: hidden[4],
            roundId,
            roundPickNumber: Number(hidden[1]),
            fantasyTeamName: hidden[5],
            capturedAt,
          });
          continue;
        }
        if (!playerName) continue;

        const playerCell = playerLink.closest(".Table__TD, [role='cell'], td");
        const playerText = playerCell?.textContent || "";
        const identity = playerText.match(/\b([A-Z]{2,4})\s+(QB|RB|WR|TE|K|D\/ST)\s*$/);
        const nflTeam = row.querySelector(".playerinfo__playerteam")?.textContent?.trim() || identity?.[1];
        const position = row.querySelector(".playerinfo__playerposition")?.textContent?.trim() || identity?.[2];
        if (!nflTeam || !position) continue;

        const roundPickNumber = Number(cells[0]?.textContent?.trim()) || Number((row.textContent || "").match(/^\s*(\d+)/)?.[1]);
        const fantasyTeamName = row.querySelector(".team-name")?.textContent?.trim() || cells.at(-1)?.textContent?.trim();
        if (!roundPickNumber || !fantasyTeamName) continue;

        picks.push({
          playerName,
          nflTeam,
          position,
          roundId,
          roundPickNumber,
          fantasyTeamName,
          capturedAt,
        });
      }
    });

    return picks;
  }

  const api = { parsePickHistory, parsePickHistoryDom, parseDraftBoard };
  root.FFCopilotEspnDomParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
