"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runAgentLoop } from "@ff-copilot/agent-runtime";
import { requestModelStep } from "./api";
import { executeTool } from "./tools";
import { getMessages } from "./threads";
import type { AgentMessage, AgentStatus, AgentThread } from "@ff-copilot/agent-runtime";

export function useAgent(thread: AgentThread | null) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let current = true;
    setMessages([]);
    setError(null);
    setStatus("idle");
    if (thread) getMessages(thread.id).then((rows) => current && setMessages(rows)).catch((cause) => current && setError(cause.message));
    return () => { current = false; controller.current?.abort(); };
  }, [thread?.id]);

  const send = useCallback(async (value: string) => {
    const content = value.trim();
    if (!thread || !content || status !== "idle") return;
    setError(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const temporaryMessage: AgentMessage = { id: -Date.now(), thread_id: thread.id, role: "user", parts: [{ type: "text", text: content }], created_at: new Date().toISOString() };
      setMessages((current) => [...current, temporaryMessage]);
      await runAgentLoop({
        thread,
        signal: abort.signal,
        initialEvent: { role: "user", parts: temporaryMessage.parts },
        onStatus: setStatus,
        onMessage: (message) => setMessages((current) => [...current, message]),
        requestStep: requestModelStep,
        executeTool,
      });
    } catch (cause) {
      if (!abort.signal.aborted) {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "The assistant failed");
      }
    } finally {
      controller.current = null;
      if (!abort.signal.aborted) setStatus((current) => current === "error" ? current : "idle");
    }
  }, [status, thread]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setStatus("idle");
  }, []);

  return { messages, status, error, send, cancel, clearError: () => { setError(null); setStatus("idle"); } };
}
