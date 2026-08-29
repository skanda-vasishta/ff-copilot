(() => {
  if (window.__ffCopilotEspnDomBridge) return;
  window.__ffCopilotEspnDomBridge = true;

  let timer = null;
  let lastDigest = "";
  let lastSentAt = 0;
  let configPromise = null;
  let configLoadedAt = 0;

  const HISTORY_SELECTOR = ".pick-history-tables";
  const BOARD_SELECTOR = ".draftBoardGrid__container";
  const HEARTBEAT_MS = 10_000;
  const POLL_MS = 2_000;

  function leagueId() {
    const url = new URL(window.location.href);
    return url.searchParams.get("leagueId") || url.searchParams.get("league_id");
  }

  async function loadDraftConfig() {
    if (configPromise && Date.now() - configLoadedAt < 60_000) {
      return configPromise;
    }
    configLoadedAt = Date.now();
    configPromise = fetchDraftConfig().catch((error) => {
      configPromise = null;
      throw error;
    });
    return configPromise;
  }

  async function fetchDraftConfig() {
    const id = leagueId();
    if (!id) return null;
    const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${new URL(window.location.href).searchParams.get("seasonId") || new Date().getFullYear()}/segments/0/leagues/${id}`);
    ["mDraftDetail", "mSettings", "mTeam"].forEach((view) => url.searchParams.append("view", view));
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    return {
      leagueId: String(data.id || id),
      seasonId: data.seasonId,
      leagueName: data.settings?.name || null,
      draftType: data.settings?.draftSettings?.type || "SNAKE",
      pickOrder: data.settings?.draftSettings?.pickOrder || [],
      roundCount: data.draftDetail?.picks?.length && data.teams?.length
        ? Math.ceil(data.draftDetail.picks.length / data.teams.length)
        : 16,
      teams: (data.teams || []).map((team) => ({
        id: team.id,
        name: team.name || [team.location, team.nickname].filter(Boolean).join(" ") || `Team ${team.id}`,
        abbrev: team.abbrev || null,
      })),
      picks: (data.draftDetail?.picks || [])
        .filter((pick) => Number(pick.playerId) > 0 && (pick.overallPickNumber || pick.id))
        .map((pick) => ({
          overallPickNumber: pick.overallPickNumber || pick.id,
          roundId: pick.roundId || null,
          roundPickNumber: pick.roundPickNumber || null,
          teamId: pick.teamId || null,
          playerId: pick.playerId,
          capturedAt: new Date().toISOString(),
        })),
    };
  }

  async function scan(force = false) {
    timer = null;
    const board = document.querySelector(BOARD_SELECTOR);
    const history = document.querySelector(HISTORY_SELECTOR);
    if (!board && !history) return;
    // ESPN keeps its board mounted with explicit completed-pick cells. This is
    // the canonical snapshot because it remains complete when the user joins
    // late; Pick History and the league API are compatibility fallbacks.
    const capturedAt = new Date().toISOString();
    const config = await loadDraftConfig().catch(() => null);
    let picks = board
      ? window.FFCopilotEspnDomParser.parseDraftBoard(board, capturedAt)
      : [];
    if (!picks.length && history) {
      picks = window.FFCopilotEspnDomParser.parsePickHistoryDom(
        history,
        capturedAt,
        (config?.teams || []).map((team) => team.name),
      );
    }
    // Keep the textual parser as a compatibility fallback if ESPN changes its
    // table component but leaves the visible pick feed intact.
    if (!picks.length) {
      picks = window.FFCopilotEspnDomParser.parsePickHistory(
        document.body?.innerText || "",
        capturedAt,
      );
    }
    const digest = picks
      .map((pick) => `${pick.roundId}:${pick.roundPickNumber}:${pick.playerName}`)
      .join("|");
    if (!force && digest === lastDigest && Date.now() - lastSentAt < HEARTBEAT_MS) return;
    lastDigest = digest;
    lastSentAt = Date.now();
    chrome.runtime.sendMessage({
      type: "FF_COPILOT_ESPN_DOM_SNAPSHOT",
      payload: {
        leagueId: leagueId(),
        pageUrl: window.location.href,
        capturedAt,
        picks,
        config,
        debug: {
          boardPicks: board?.querySelectorAll(".draft-board-grid-pick-cell.completedPick").length || 0,
          rounds: history?.querySelectorAll(".pick-history-table").length || 0,
          tableRows: history?.querySelectorAll(".Table__TR").length || 0,
          roleRows: history?.querySelectorAll("[role='row']").length || 0,
          htmlRows: history?.querySelectorAll("tr").length || 0,
          hiddenSample: Array.from(history?.querySelectorAll(".Table__TR") || [])
            .find((row) => !row.querySelector(".playerinfo__playername, a") && /^\s*\d/.test(row.textContent || ""))
            ?.textContent?.slice(0, 240) || "",
        },
      },
    });
  }

  async function scanFullHistory() {
    // The history subtree is persistent, so a refresh never needs to alter the
    // user's selected ESPN tab.
    await scan(true);
  }

  function schedule() {
    if (timer != null) return;
    timer = window.setTimeout(scan, 150);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "FF_COPILOT_FORCE_REFRESH") return;
    scanFullHistory().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  });

  let observedRoot = null;
  const observer = new MutationObserver(schedule);
  const mountObserver = new MutationObserver(() => observeHistory());

  function observeHistory() {
    const root = document.querySelector(BOARD_SELECTOR) || document.querySelector(HISTORY_SELECTOR);
    if (!root || root === observedRoot) return;
    observer.disconnect();
    observedRoot = root;
    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    scan(true);
  }

  function start() {
    if (!document.body) return window.setTimeout(start, 50);
    mountObserver.observe(document.body, { childList: true, subtree: true });
    observeHistory();
    window.setInterval(() => {
      observeHistory();
      scan();
    }, POLL_MS);
  }
  start();
})();
