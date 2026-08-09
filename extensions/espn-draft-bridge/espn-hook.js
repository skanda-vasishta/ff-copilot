(() => {
  if (window.__ffCopilotEspnWebSocketHooked) return;
  window.__ffCopilotEspnWebSocketHooked = true;

  const NativeWebSocket = window.WebSocket;
  const MAX_FRAME_LENGTH = 1_000_000;

  function publish(direction, socketUrl, value) {
    const send = (text) => {
      if (!text || text.length > MAX_FRAME_LENGTH) return;
      window.dispatchEvent(
        new CustomEvent("ff-copilot:espn-ws-frame", {
          detail: {
            direction,
            socketUrl,
            pageUrl: window.location.href,
            frame: text,
            capturedAt: new Date().toISOString(),
          },
        }),
      );
    };

    if (typeof value === "string") return send(value);
    if (value instanceof Blob) {
      value.text().then(send).catch(() => undefined);
      return;
    }
    if (value instanceof ArrayBuffer) {
      try {
        send(new TextDecoder().decode(value));
      } catch {
        // Ignore non-text binary traffic.
      }
    }
  }

  function attach(socket, socketUrl) {
    socket.addEventListener("message", (event) =>
      publish("incoming", socketUrl, event.data),
    );
    const nativeSend = socket.send;
    socket.send = function ffCopilotSend(data) {
      publish("outgoing", socketUrl, data);
      return nativeSend.call(this, data);
    };
    return socket;
  }

  function FFWebSocket(url, protocols) {
    const socket =
      protocols === undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols);
    return attach(socket, String(url));
  }

  Object.setPrototypeOf(FFWebSocket, NativeWebSocket);
  FFWebSocket.prototype = NativeWebSocket.prototype;
  window.WebSocket = FFWebSocket;
})();
