# FF Copilot ESPN Draft Bridge

This Manifest V3 extension captures the ESPN draft room's incoming WebSocket
frames and reconciles them against its visible Pick History. Normalized draft
picks are then made available to an open FF Copilot tab.
It does not read or transmit ESPN cookies, passwords, or account tokens.

## Install for development

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this directory.
4. Reload both the ESPN draft room and FF Copilot Draft Room. The ESPN tab must
   be reloaded because interception starts at `document_start`.

Keep the ESPN draft tab open during the draft. FF Copilot requests the latest
captured board once per second and merges it over ESPN's public league snapshot.

## Verify the parser

```bash
node extensions/espn-draft-bridge/parser.test.cjs
```

ESPN's protocol is undocumented and may run inside a worker. The visible Pick
History is therefore the authoritative fallback. Recent diagnostics remain inside
`chrome.storage.local` to make upstream message-shape changes diagnosable; raw
frame contents are not retained.
