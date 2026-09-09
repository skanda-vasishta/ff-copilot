"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runAgentLoop } from "@ff-copilot/agent-runtime";
import type { AgentStatus, AgentThread } from "@ff-copilot/agent-runtime";
import { requestModelStep } from "@/features/copilot/client/api";
import { executeTool } from "@/features/copilot/client/tools";
import { createThread } from "@/features/copilot/client/threads";
import { schemaForWorkflow, type RecommendationResult, type RecommendationWorkflow } from "./schema";
import { loadRecommendation, saveRecommendation } from "./client";

export function useRecommendationAgent(input: { workflow: RecommendationWorkflow; teamId?: string; leagueId?: string; season?: number; leagueSyncedAt?: string | null }) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [loadingResult, setLoadingResult] = useState(true);
  const thread = useRef<AgentThread | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    let current = true;
    controller.current?.abort();
    controller.current = null;
    thread.current = null;
    setResult(null);
    setError(null);
    setStatus("idle");
    setLoadingResult(Boolean(input.teamId));
    if (input.teamId) loadRecommendation({ teamId: input.teamId, workflow: input.workflow, leagueSyncedAt: input.leagueSyncedAt })
      .then((saved) => { if (current) setResult(saved); })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Could not load saved recommendations"); })
      .finally(() => { if (current) setLoadingResult(false); });
    else setLoadingResult(false);
    return () => { current = false; };
  }, [input.leagueSyncedAt, input.teamId, input.workflow]);

  const run = useCallback(async (prompt: string) => {
    if (!input.teamId || !input.leagueId || status !== "idle") return;
    setError(null);
    setStatus("responding");
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (!thread.current) {
        const title = input.workflow === "free-agents" ? "Free agent recommendations" : "Trade recommendations";
        const created = await createThread({ teamId: input.teamId, leagueId: input.leagueId, title });
        thread.current = { ...created, season: input.season };
      }
      const activeThread = { ...thread.current, season: input.season };
      const final = await runAgentLoop({
        thread: activeThread,
        signal: abort.signal,
        initialEvent: { role: "user", parts: [{ type: "text", text: prompt }] },
        onStatus: setStatus,
        onMessage: () => undefined,
        requestStep: (threadId, events, runId, signal) => requestModelStep(threadId, events, runId, signal, input.workflow),
        executeTool,
      });
      if (!final) throw new Error("The recommender did not return a result");
      const parsed = schemaForWorkflow(input.workflow).parse(JSON.parse(final.text));
      setResult(parsed as RecommendationResult);
      await saveRecommendation({
        teamId: input.teamId,
        workflow: input.workflow,
        position: positionFromPrompt(prompt),
        prompt,
        result: parsed as RecommendationResult,
        leagueSyncedAt: input.leagueSyncedAt,
      });
    } catch (cause) {
      if (!abort.signal.aborted) {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "The recommender failed");
      }
    } finally {
      controller.current = null;
      if (!abort.signal.aborted) setStatus((current) => current === "error" ? current : "idle");
    }
  }, [input.leagueId, input.leagueSyncedAt, input.season, input.teamId, input.workflow, status]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setStatus("idle");
  }, []);

  return { run, cancel, result, loadingResult, status, error, clearError: () => { setError(null); setStatus("idle"); } };
}

function positionFromPrompt(prompt: string): "ALL" | "QB" | "RB" | "WR" | "TE" {
  const match = prompt.match(/Focus only on (QB|RB|WR|TE)\./);
  return match ? match[1] as "QB" | "RB" | "WR" | "TE" : "ALL";
}
