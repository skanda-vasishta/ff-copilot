window.addEventListener("ff-copilot:espn-ws-frame", (event) => {
  const detail = event.detail;
  if (!detail || typeof detail.frame !== "string") return;
  try {
    const host = new URL(detail.socketUrl).hostname;
    if (
      !host.endsWith("fantasy.espn.com") &&
      !host.includes("espn")
    )
      return;
  } catch {
    return;
  }
  chrome.runtime.sendMessage({
    type: "FF_COPILOT_ESPN_FRAME",
    payload: detail,
  });
});
