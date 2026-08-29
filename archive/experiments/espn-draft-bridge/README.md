# FF Copilot ESPN Draft Bridge

This Manifest V3 extension reads ESPN's persistent Pick History DOM and makes
complete, normalized draft snapshots available to an open FF Copilot tab.
It does not read or transmit ESPN cookies, passwords, or account tokens.

## Install

1. Download and unzip `ff-copilot-espn-draft-bridge.zip`.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the unzipped folder.
5. Reload both the ESPN draft room and FF Copilot Draft Room.

Keep the ESPN draft tab open during the draft. The extension observes
`.pick-history-tables`, polls it every two seconds as a fallback, and sends a
new complete snapshot whenever the picks change. FF Copilot reconciles repeated
snapshots idempotently.

## Verify the parser

```bash
node parser.test.cjs
```

Recent diagnostics remain inside `chrome.storage.local` to make upstream DOM
changes diagnosable. No ESPN WebSocket frames are intercepted or retained.
