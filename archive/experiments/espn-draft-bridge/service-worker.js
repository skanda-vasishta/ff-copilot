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
  if (payload.config) {
    session.config = payload.config;
    session.picks = {};
    for (const pick of payload.config.picks || []) mergePick(session, pick);
  }
  for (const pick of payload.picks || []) mergePick(session, pick);
  session.diagnostics.unshift({
    capturedAt: payload.capturedAt,
    direction: "dom",
    parsedPicks: payload.picks?.length || 0,
  });
  session.diagnostics = session.diagnostics.slice(0, MAX_DIAGNOSTICS);
  await persist(state);
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
    session.transport = "websocket";
    session.diagnostics.unshift({
      capturedAt: payload.capturedAt,
      direction: payload.direction,
      length: payload.frame.length,
      parsedPicks: parsed.picks.length,
    });
    session.diagnostics = session.diagnostics.slice(0, MAX_DIAGNOSTICS);
    for (const pick of parsed.picks) mergePick(session, pick);
    for (const event of parsed.events || []) {
      if (event.type === "selected") {
        const existing = Object.values(session.picks).find(
          (pick) => pick.playerId === event.playerId,
        );
        // SELECTED lacks a reliable overall pick number. The authenticated
        // draft-detail poll supplies the authoritative pick on the next scan.
        if (existing) mergePick(session, existing);
      } else if (event.type === "undone") {
        delete session.picks[`overall:${event.overallPickNumber}`];
      } else if (event.type === "selecting") {
        session.onTheClockTeamId = event.teamId;
        session.timeToPick = event.timeToPick;
      }
    }
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
  const capturedPicks = session?.config?.picks?.length
    ? session.config.picks
    : Object.values(session?.picks || {});
  return {
    installed: true,
    matched,
    connected,
    leagueId: session?.leagueId || null,
    lastFrameAt: session?.lastFrameAt || null,
    picks: capturedPicks
      .filter((pick) => Number(pick.overallPickNumber) > 0 && Number(pick.playerId) > 0)
      .sort((a, b) => Number(a.overallPickNumber) - Number(b.overallPickNumber)),
    diagnostics: session?.diagnostics || [],
    onTheClockTeamId: session?.onTheClockTeamId || null,
    timeToPick: session?.timeToPick || null,
    config: session?.config || null,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "FF_COPILOT_ESPN_FRAME") {
    acceptFrame(message.payload).catch(() => undefined);
    return;
  }
  if (message?.type === "FF_COPILOT_ESPN_DOM_SNAPSHOT") {
    acceptDomSnapshot(message.payload).catch(() => undefined);
    return;
  }
  if (message?.type === "FF_COPILOT_GET_DRAFT_STATE") {
    getState(message.leagueId).then(sendResponse);
    return true;
  }
});
