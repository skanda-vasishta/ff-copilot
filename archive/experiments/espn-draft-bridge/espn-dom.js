(() => {
  if (window.__ffCopilotEspnDomBridge) return;
  window.__ffCopilotEspnDomBridge = true;

  let timer = null;
  let lastDigest = "";
  let lastSentAt = 0;

  function leagueId() {
    const url = new URL(window.location.href);
    return url.searchParams.get("leagueId") || url.searchParams.get("league_id");
  }

  function scan() {
    timer = null;
    const text = document.body?.innerText || "";
    const capturedAt = new Date().toISOString();
    const picks = window.FFCopilotEspnDomParser.parsePickHistory(
      text,
      capturedAt,
    );
    const digest = picks
      .map((pick) => `${pick.roundId}:${pick.roundPickNumber}:${pick.playerName}`)
      .join("|");
    if (digest === lastDigest && Date.now() - lastSentAt < 2500) return;
    lastDigest = digest;
    lastSentAt = Date.now();
    chrome.runtime.sendMessage({
      type: "FF_COPILOT_ESPN_DOM_SNAPSHOT",
      payload: {
        leagueId: leagueId(),
        pageUrl: window.location.href,
        capturedAt,
        picks,
      },
    });
  }

  function schedule() {
    if (timer != null) return;
    timer = window.setTimeout(scan, 150);
  }

  const observer = new MutationObserver(schedule);
  function start() {
    if (!document.body) return window.setTimeout(start, 50);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    scan();
    window.setInterval(scan, 3000);
  }
  start();
})();
