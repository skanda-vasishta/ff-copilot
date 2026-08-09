importScripts("parser.js");

const STORAGE_KEY = "ffCopilotEspnDraftState";
const MAX_DIAGNOSTICS = 20;
let statePromise = chrome.storage.local
  .get(STORAGE_KEY)
  .then((result) => result[STORAGE_KEY] || { sessions: {} });

function leagueIdFromUrl(value) {
  try {
    const url = new URL(value);
    return url.searchParams.get("leagueId") || url.searchParams.get("league_id");
  } catch {
    return null;
  }
}

async function persist(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function mergePick(session, pick) {
  const key = pick.overallPickNumber
    ? `overall:${pick.overallPickNumber}`
    : `player:${pick.playerId}`;
  session.picks[key] = { ...session.picks[key], ...pick };
}

async function acceptFrame(payload) {
  const state = await statePromise;
  const parsed = self.FFCopilotEspnParser.parseFrame(
    payload.frame,
    payload.capturedAt,
  );
  const urlLeagueId = leagueIdFromUrl(payload.pageUrl);
  const leagueIds = parsed.leagueIds.length
    ? parsed.leagueIds
    : urlLeagueId
      ? [urlLeagueId]
      : ["unknown"];

  for (const leagueId of leagueIds) {
    const session = (state.sessions[leagueId] ||= {
      leagueId: leagueId === "unknown" ? null : leagueId,
      picks: {},
      diagnostics: [],
      connected: true,
    });
    session.connected = true;
    session.pageUrl = payload.pageUrl;
    session.socketUrl = payload.socketUrl;
    session.lastFrameAt = payload.capturedAt;
    session.diagnostics.unshift({
      capturedAt: payload.capturedAt,
      direction: payload.direction,
      length: payload.frame.length,
      parsedPicks: parsed.picks.length,
    });
    session.diagnostics = session.diagnostics.slice(0, MAX_DIAGNOSTICS);
    for (const pick of parsed.picks) mergePick(session, pick);
  }
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
  return {
    installed: true,
    matched,
    connected,
    leagueId: session?.leagueId || null,
    lastFrameAt: session?.lastFrameAt || null,
    picks: Object.values(session?.picks || {}).sort(
      (a, b) =>
        (a.overallPickNumber || Number.MAX_SAFE_INTEGER) -
        (b.overallPickNumber || Number.MAX_SAFE_INTEGER),
    ),
    diagnostics: session?.diagnostics || [],
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "FF_COPILOT_ESPN_FRAME") {
    acceptFrame(message.payload).catch(() => undefined);
    return;
  }
  if (message?.type === "FF_COPILOT_GET_DRAFT_STATE") {
    getState(message.leagueId).then(sendResponse);
    return true;
  }
});
