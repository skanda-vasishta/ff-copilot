const STORAGE_KEY = "ffCopilotEspnDraftState";
const MAX_DIAGNOSTICS = 20;
let statePromise = chrome.storage.local
  .get(STORAGE_KEY)
  .then((result) => result[STORAGE_KEY] || { sessions: {} });

async function persist(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function mergePick(session, pick) {
  const key = pick.overallPickNumber
    ? `overall:${pick.overallPickNumber}`
    : pick.roundId && pick.roundPickNumber
      ? `round:${pick.roundId}:${pick.roundPickNumber}`
    : `player:${pick.playerId}`;
  session.picks[key] = { ...session.picks[key], ...pick };
}

async function acceptDomSnapshot(payload) {
  const state = await statePromise;
  const leagueId = String(payload.leagueId || "unknown");
  const session = (state.sessions[leagueId] ||= {
    leagueId: leagueId === "unknown" ? null : leagueId,
    picks: {},
    diagnostics: [],
    connected: true,
  });
  session.connected = true;
  session.pageUrl = payload.pageUrl;
  session.lastFrameAt = payload.capturedAt;
  session.transport = "dom";
  const boardIsComplete = Number(payload.debug?.boardPicks) > 0
    && Number(payload.debug.boardPicks) === Number(payload.picks?.length || 0);
  if (boardIsComplete) session.picks = {};
  if (payload.config) {
    session.config = payload.config;
    for (const pick of payload.config.picks || []) mergePick(session, pick);
  }
  for (const pick of payload.picks || []) mergePick(session, pick);
  session.diagnostics.unshift({
    capturedAt: payload.capturedAt,
    direction: "dom",
    parsedPicks: payload.picks?.length || 0,
    ...payload.debug,
  });
  session.diagnostics = session.diagnostics.slice(0, MAX_DIAGNOSTICS);
  await persist(state);
}

async function getState(leagueId) {
  const state = await statePromise;
  let session = state.sessions[String(leagueId)];
  let matched = Boolean(session);
  if (!session) {
    const candidates = Object.values(state.sessions).filter(
      (item) =>
        item.lastFrameAt && Date.now() - Date.parse(item.lastFrameAt) < 15_000,
    );
    if (candidates.length === 1) session = candidates[0];
  }
  const lastFrameMs = session?.lastFrameAt
    ? Date.parse(session.lastFrameAt)
    : Number.NaN;
  const connected =
    Number.isFinite(lastFrameMs) && Date.now() - lastFrameMs < 15_000;
  const capturedPicks = Object.values(session?.picks || {});
  const teamCount = session?.config?.teams?.length || 0;
  return {
    installed: true,
    matched,
    connected,
    leagueId: session?.leagueId || null,
    lastFrameAt: session?.lastFrameAt || null,
    picks: capturedPicks
      .map((pick) => ({
        ...pick,
        overallPickNumber: Number(pick.overallPickNumber) || (teamCount && Number(pick.roundId) > 0 && Number(pick.roundPickNumber) > 0
          ? (Number(pick.roundId) - 1) * teamCount + Number(pick.roundPickNumber)
          : 0),
      }))
      .filter((pick) => Number(pick.overallPickNumber) > 0 && (Number(pick.playerId) > 0 || pick.playerName))
      .sort((a, b) => Number(a.overallPickNumber) - Number(b.overallPickNumber)),
    diagnostics: session?.diagnostics || [],
    onTheClockTeamId: session?.onTheClockTeamId || null,
    timeToPick: session?.timeToPick || null,
    config: session?.config || null,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "FF_COPILOT_ESPN_DOM_SNAPSHOT") {
    acceptDomSnapshot(message.payload).catch(() => undefined);
    return;
  }
  if (message?.type === "FF_COPILOT_GET_DRAFT_STATE") {
    getState(message.leagueId).then(sendResponse);
    return true;
  }
  if (message?.type === "FF_COPILOT_REFRESH_DRAFT") {
    chrome.tabs.query({ url: ["https://fantasy.espn.com/*", "https://*.fantasy.espn.com/*"] })
      .then((tabs) => Promise.all(tabs.map((tab) => tab.id
        ? chrome.tabs.sendMessage(tab.id, { type: "FF_COPILOT_FORCE_REFRESH" }).catch(() => null)
        : null)))
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});
