"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { runAgentLoop } from "@ff-copilot/agent-runtime";
import type { AgentStatus, AgentThread } from "@ff-copilot/agent-runtime";
import { requestModelStep } from "@/features/copilot/client/api";
import { executeTool } from "@/features/copilot/client/tools";
import { createThread, deleteThread } from "@/features/copilot/client/threads";
import { schemaForWorkflow, type RecommendationResult, type RecommendationWorkflow } from "./schema";
import { loadRecommendation, saveRecommendation } from "./client";

type RecommendationInput = {
  workflow: RecommendationWorkflow;
  teamId?: string;
  leagueId?: string;
  season?: number;
  leagueSyncedAt?: string | null;
};

type RecommendationSnapshot = {
  status: AgentStatus;
  error: string | null;
  result: RecommendationResult | null;
  loadingResult: boolean;
};

type RecommendationRun = {
  snapshot: RecommendationSnapshot;
  thread: AgentThread | null;
  controller: AbortController | null;
  loadedForSync: string | null | undefined;
  loadToken: symbol | null;
  listeners: Set<() => void>;
};

const EMPTY_SNAPSHOT: RecommendationSnapshot = {
  status: "idle",
  error: null,
  result: null,
  loadingResult: false,
};
const recommendationRuns = new Map<string, RecommendationRun>();

function runKey(input: RecommendationInput) {
  return input.teamId ? `${input.teamId}:${input.workflow}` : null;
}

function getRun(key: string) {
  let run = recommendationRuns.get(key);
  if (!run) {
    run = {
      snapshot: { ...EMPTY_SNAPSHOT, loadingResult: true },
      thread: null,
      controller: null,
      loadedForSync: undefined,
      loadToken: null,
      listeners: new Set(),
    };
    recommendationRuns.set(key, run);
  }
  return run;
}

function updateRun(key: string, patch: Partial<RecommendationSnapshot>) {
  const run = getRun(key);
  run.snapshot = { ...run.snapshot, ...patch };
  run.listeners.forEach((listener) => listener());
}

function loadSavedResult(key: string, input: RecommendationInput) {
  const run = getRun(key);
  if (run.loadedForSync === input.leagueSyncedAt || run.loadToken) return;
  const token = Symbol("recommendation-load");
  run.loadToken = token;
  updateRun(key, { loadingResult: true, error: null });
  void loadRecommendation({
    teamId: input.teamId!,
    workflow: input.workflow,
    leagueSyncedAt: input.leagueSyncedAt,
  }).then((saved) => {
    if (run.loadToken === token && !run.controller) updateRun(key, { result: saved });
    run.loadedForSync = input.leagueSyncedAt;
  }).catch((cause) => {
    if (run.loadToken === token) updateRun(key, {
      error: cause instanceof Error ? cause.message : "Could not load saved recommendations",
    });
  }).finally(() => {
    if (run.loadToken === token) {
      run.loadToken = null;
      updateRun(key, { loadingResult: false });
    }
  });
}

async function startRecommendation(key: string, input: RecommendationInput, prompt: string) {
  const run = getRun(key);
  if (!input.teamId || !input.leagueId || run.snapshot.status !== "idle" || run.controller) return;
  const controller = new AbortController();
  run.controller = controller;
  updateRun(key, { error: null, status: "responding" });
  try {
    const title = input.workflow === "free-agents"
      ? "Free agent recommendations"
      : input.workflow === "trades" ? "Trade recommendations" : "Best lineup recommendations";
    const created = await createThread({ teamId: input.teamId, leagueId: input.leagueId, title });
    run.thread = { ...created, season: input.season };
    const activeThread = { ...run.thread, season: input.season };
    const final = await runAgentLoop({
      thread: activeThread,
      signal: controller.signal,
      initialEvent: { role: "user", parts: [{ type: "text", text: prompt }] },
      onStatus: (status) => updateRun(key, { status }),
      onMessage: () => undefined,
      requestStep: (threadId, events, runId, signal) => requestModelStep(threadId, events, runId, signal, input.workflow),
      executeTool,
    });
    if (!final) throw new Error("The recommender did not return a result");
    const parsed = schemaForWorkflow(input.workflow).parse(JSON.parse(final.text)) as RecommendationResult;
    updateRun(key, { result: parsed });
    await saveRecommendation({
      teamId: input.teamId,
      workflow: input.workflow,
      position: input.workflow === "lineup" ? "ALL" : positionFromPrompt(prompt),
      prompt,
      result: parsed,
      leagueSyncedAt: input.leagueSyncedAt,
    });
  } catch (cause) {
    if (!controller.signal.aborted) updateRun(key, {
      status: "error",
      error: cause instanceof Error ? cause.message : "The recommender failed",
    });
  } finally {
    const completedThread = run.thread;
    run.thread = null;
    if (completedThread) void deleteThread(completedThread.id).catch(() => undefined);
    if (run.controller === controller) run.controller = null;
    if (!controller.signal.aborted && getRun(key).snapshot.status !== "error") {
      updateRun(key, { status: "idle" });
    }
  }
}

/** Recommendation jobs live outside React so route changes never cancel them. */
export function useRecommendationAgent(input: RecommendationInput) {
  const key = runKey(input);
  const subscribe = useCallback((listener: () => void) => {
    if (!key) return () => undefined;
    const run = getRun(key);
    run.listeners.add(listener);
    return () => { run.listeners.delete(listener); };
  }, [key]);
  const getSnapshot = useCallback(() => key ? getRun(key).snapshot : EMPTY_SNAPSHOT, [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);

  useEffect(() => {
    if (key) loadSavedResult(key, input);
  }, [input.leagueSyncedAt, input.teamId, input.workflow, key]);

  const run = useCallback(async (prompt: string) => {
    if (key) await startRecommendation(key, input, prompt);
  }, [input, key]);

  const cancel = useCallback(() => {
    if (!key) return;
    const active = getRun(key);
    active.controller?.abort();
    active.controller = null;
    updateRun(key, { status: "idle" });
  }, [key]);

  const clearError = useCallback(() => {
    if (key) updateRun(key, { error: null, status: "idle" });
  }, [key]);

  return { ...snapshot, run, cancel, clearError };
}

function positionFromPrompt(prompt: string): "ALL" | "QB" | "RB" | "WR" | "TE" {
  const match = prompt.match(/Focus only on (QB|RB|WR|TE)\./);
  return match ? match[1] as "QB" | "RB" | "WR" | "TE" : "ALL";
}
