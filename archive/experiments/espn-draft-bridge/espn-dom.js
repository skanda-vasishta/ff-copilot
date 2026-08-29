(() => {
  if (window.__ffCopilotEspnDomBridge) return;
  window.__ffCopilotEspnDomBridge = true;

  let timer = null;
  let lastDigest = "";
  let lastSentAt = 0;
  let configPromise = null;
  let configLoadedAt = 0;

  const HISTORY_SELECTOR = ".pick-history-tables";
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
    const history = document.querySelector(HISTORY_SELECTOR);
    if (!history) return;
    // ESPN keeps every round table mounted beneath .pick-history-tables even
    // while the Players or Board tab is selected. Reading this subtree gives
    // us a complete, ordered snapshot without opening a tab or intercepting
    // ESPN's private WebSocket protocol.
    const text = history.innerText || history.textContent || "";
    const capturedAt = new Date().toISOString();
    const picks = window.FFCopilotEspnDomParser.parsePickHistory(
      text,
      capturedAt,
    );
    const digest = picks
      .map((pick) => `${pick.roundId}:${pick.roundPickNumber}:${pick.playerName}`)
      .join("|");
    if (!force && digest === lastDigest && Date.now() - lastSentAt < HEARTBEAT_MS) return;
    lastDigest = digest;
    lastSentAt = Date.now();
    const config = await loadDraftConfig().catch(() => null);
    chrome.runtime.sendMessage({
      type: "FF_COPILOT_ESPN_DOM_SNAPSHOT",
      payload: {
        leagueId: leagueId(),
        pageUrl: window.location.href,
        capturedAt,
        picks,
        config,
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

  let observedHistory = null;
  const observer = new MutationObserver(schedule);
  const mountObserver = new MutationObserver(() => observeHistory());

  function observeHistory() {
    const history = document.querySelector(HISTORY_SELECTOR);
    if (!history || history === observedHistory) return;
    observer.disconnect();
    observedHistory = history;
    observer.observe(history, {
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
