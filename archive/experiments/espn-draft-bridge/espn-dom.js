(() => {
  if (window.__ffCopilotEspnDomBridge) return;
  window.__ffCopilotEspnDomBridge = true;

  let timer = null;
  let lastDigest = "";
  let lastSentAt = 0;
  let configLoaded = false;

  function leagueId() {
    const url = new URL(window.location.href);
    return url.searchParams.get("leagueId") || url.searchParams.get("league_id");
  }

  async function loadDraftConfig() {
    if (configLoaded) return null;
    const id = leagueId();
    if (!id) return null;
    const url = new URL(`/apis/v3/games/ffl/seasons/${new URL(window.location.href).searchParams.get("seasonId") || new Date().getFullYear()}/segments/0/leagues/${id}`, window.location.origin);
    ["mDraftDetail", "mSettings", "mTeam"].forEach((view) => url.searchParams.append("view", view));
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    configLoaded = true;
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
    };
  }

  async function scan() {
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
