"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { runAgentLoop } from "@ff-copilot/agent-runtime";
import { requestModelStep } from "./api";
import { executeTool } from "./tools";
import { getMessages } from "./threads";
import type { AgentMessage, AgentStatus, AgentThread } from "@ff-copilot/agent-runtime";

type AgentSnapshot = {
  messages: AgentMessage[];
  status: AgentStatus;
  error: string | null;
};

type AgentRun = {
  snapshot: AgentSnapshot;
  controller: AbortController | null;
  loaded: boolean;
  loading: Promise<void> | null;
  listeners: Set<() => void>;
};

const EMPTY_SNAPSHOT: AgentSnapshot = { messages: [], status: "idle", error: null };
const runs = new Map<string, AgentRun>();

function getRun(threadId: string) {
  let run = runs.get(threadId);
  if (!run) {
    run = {
      snapshot: EMPTY_SNAPSHOT,
      controller: null,
      loaded: false,
      loading: null,
      listeners: new Set(),
    };
    runs.set(threadId, run);
  }
  return run;
}

function updateRun(threadId: string, patch: Partial<AgentSnapshot>) {
  const run = getRun(threadId);
  run.snapshot = { ...run.snapshot, ...patch };
  run.listeners.forEach((listener) => listener());
}

function loadMessages(threadId: string) {
  const run = getRun(threadId);
  if (run.loaded || run.loading) return run.loading;
  run.loading = getMessages(threadId)
    .then((messages) => {
      // Preserve optimistic/new messages if a send began while history loaded.
      const loadedIds = new Set(messages.map((message) => message.id));
      const newerMessages = run.snapshot.messages.filter((message) => !loadedIds.has(message.id));
      updateRun(threadId, { messages: [...messages, ...newerMessages] });
      run.loaded = true;
    })
    .catch((cause) => updateRun(threadId, {
      error: cause instanceof Error ? cause.message : "Could not load the conversation",
    }))
    .finally(() => { run.loading = null; });
  return run.loading;
}

async function sendMessage(thread: AgentThread, value: string) {
  const content = value.trim();
  const run = getRun(thread.id);
  if (!content || run.snapshot.status !== "idle" || run.controller) return;

  const controller = new AbortController();
  run.controller = controller;
  const temporaryMessage: AgentMessage = {
    id: -Date.now(),
    thread_id: thread.id,
    role: "user",
    parts: [{ type: "text", text: content }],
    created_at: new Date().toISOString(),
  };
  updateRun(thread.id, {
    error: null,
    messages: [...run.snapshot.messages, temporaryMessage],
  });

  try {
    await runAgentLoop({
      thread,
      signal: controller.signal,
      initialEvent: { role: "user", parts: temporaryMessage.parts },
      onStatus: (status) => updateRun(thread.id, { status }),
      onMessage: (message) => updateRun(thread.id, {
        messages: [...getRun(thread.id).snapshot.messages, message],
      }),
      requestStep: requestModelStep,
      executeTool,
    });
  } catch (cause) {
    if (!controller.signal.aborted) {
      updateRun(thread.id, {
        status: "error",
        error: cause instanceof Error ? cause.message : "The assistant failed",
      });
    }
  } finally {
    if (run.controller === controller) run.controller = null;
    if (!controller.signal.aborted && getRun(thread.id).snapshot.status !== "error") {
      updateRun(thread.id, { status: "idle" });
    }
  }
}

/**
 * Conversation runs deliberately live outside React. Navigating away or switching
 * conversations only unsubscribes this view; it does not cancel in-flight work.
 */
export function useAgent(thread: AgentThread | null) {
  const threadId = thread?.id || null;
  const subscribe = useCallback((listener: () => void) => {
    if (!threadId) return () => undefined;
    const run = getRun(threadId);
    run.listeners.add(listener);
    return () => { run.listeners.delete(listener); };
  }, [threadId]);
  const getSnapshot = useCallback(
    () => threadId ? getRun(threadId).snapshot : EMPTY_SNAPSHOT,
    [threadId],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);

  useEffect(() => {
    if (threadId) void loadMessages(threadId);
  }, [threadId]);

  const send = useCallback(async (value: string) => {
    if (thread) await sendMessage(thread, value);
  }, [thread]);

  const cancel = useCallback(() => {
    if (!threadId) return;
    const run = getRun(threadId);
    run.controller?.abort();
    run.controller = null;
    updateRun(threadId, { status: "idle" });
  }, [threadId]);

  const clearError = useCallback(() => {
    if (threadId) updateRun(threadId, { error: null, status: "idle" });
  }, [threadId]);

  return { ...snapshot, send, cancel, clearError };
}
