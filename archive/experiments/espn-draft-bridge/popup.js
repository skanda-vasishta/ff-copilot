const STORAGE_KEY = "ffCopilotEspnDraftState";

async function render() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const sessions = Object.values(stored[STORAGE_KEY]?.sessions || {});
  const session = sessions.sort((a, b) =>
    String(b.lastFrameAt || "").localeCompare(String(a.lastFrameAt || "")),
  )[0];
  document.getElementById("league").textContent = session?.leagueId || "—";
  document.getElementById("picks").textContent = String(Object.keys(session?.picks || {}).length);
  document.getElementById("updated").textContent = session?.lastFrameAt
    ? new Date(session.lastFrameAt).toLocaleTimeString()
    : "—";
  const scan = session?.diagnostics?.[0];
  document.getElementById("scan").textContent = scan
    ? `${scan.parsedPicks} parsed / ${scan.boardPicks || 0} completed board cells`
    : "—";
  document.getElementById("sample").textContent = scan?.hiddenSample || "";
  document.getElementById("message").innerHTML = session
    ? '<span class="live">Connected.</span> Keep the ESPN draft tab open.'
    : "Open an ESPN draft room, then reload that tab.";
}

document.getElementById("refresh").addEventListener("click", render);
render();
