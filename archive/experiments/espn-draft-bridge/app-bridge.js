const REQUEST_EVENT = "ff-copilot:draft-bridge-request";
const RESPONSE_EVENT = "ff-copilot:draft-bridge-state";
const PAGE_SOURCE = "ff-copilot-page";
const EXTENSION_SOURCE = "ff-copilot-extension";

window.addEventListener(REQUEST_EVENT, (event) => {
  const leagueId = event.detail?.leagueId;
  if (!leagueId) return;
  if (event.detail?.refresh) {
    chrome.runtime.sendMessage(
      { type: "FF_COPILOT_REFRESH_DRAFT", leagueId },
      () => window.setTimeout(() => requestState(leagueId), 700),
    );
    return;
  }
  requestState(leagueId);
});

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== PAGE_SOURCE || event.data?.type !== "draft-bridge-request") return;
  handleRequest(event.data);
});

function handleRequest(detail) {
  const leagueId = detail?.leagueId;
  if (!leagueId) return;
  if (detail.refresh) {
    chrome.runtime.sendMessage(
      { type: "FF_COPILOT_REFRESH_DRAFT", leagueId },
      () => window.setTimeout(() => requestState(leagueId), 700),
    );
    return;
  }
  requestState(leagueId);
}

function requestState(leagueId) {
  chrome.runtime.sendMessage(
    { type: "FF_COPILOT_GET_DRAFT_STATE", leagueId },
    (state) => {
      if (chrome.runtime.lastError) return;
      window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: state }));
      window.postMessage({ source: EXTENSION_SOURCE, type: "draft-bridge-state", state }, window.location.origin);
    },
  );
}

window.dispatchEvent(
  new CustomEvent(RESPONSE_EVENT, {
    detail: { installed: true, connected: false, picks: [] },
  }),
);
window.postMessage({ source: EXTENSION_SOURCE, type: "draft-bridge-state", state: { installed: true, connected: false, picks: [] } }, window.location.origin);
