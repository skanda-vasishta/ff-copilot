const REQUEST_EVENT = "ff-copilot:draft-bridge-request";
const RESPONSE_EVENT = "ff-copilot:draft-bridge-state";

window.addEventListener(REQUEST_EVENT, (event) => {
  const leagueId = event.detail?.leagueId;
  if (!leagueId) return;
  chrome.runtime.sendMessage(
    { type: "FF_COPILOT_GET_DRAFT_STATE", leagueId },
    (state) => {
      if (chrome.runtime.lastError) return;
      window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: state }));
    },
  );
});

window.dispatchEvent(
  new CustomEvent(RESPONSE_EVENT, {
    detail: { installed: true, connected: false, picks: [] },
  }),
);
