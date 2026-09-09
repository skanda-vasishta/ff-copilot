"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { runAgentLoop } from "@ff-copilot/agent-runtime";
import type { AgentStatus, AgentThread } from "@ff-copilot/agent-runtime";
import { requestModelStep } from "@/features/copilot/client/api";
import { executeTool } from "@/features/copilot/client/tools";
import { createThread, updateThread } from "@/features/copilot/client/threads";
import { schemaForWorkflow, type RecommendationResult, type RecommendationWorkflow } from "./schema";

export function useRecommendationAgent(input: { workflow: RecommendationWorkflow; teamId?: string; leagueId?: string; season?: number }) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const thread = useRef<AgentThread | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    thread.current = null;
    setResult(null);
    setError(null);
    setStatus("idle");
  }, [input.teamId, input.workflow]);

  const run = useCallback(async (prompt: string) => {
    if (!input.teamId || !input.leagueId || status !== "idle") return;
    setError(null);
    setStatus("responding");
    const abort = new AbortController();
    controller.current = abort;
    try {
      if (!thread.current) {
        const created = await createThread({ teamId: input.teamId, leagueId: input.leagueId });
        const title = input.workflow === "free-agents" ? "Free agent recommendations" : "Trade recommendations";
        thread.current = { ...(await updateThread(created.id, { title })), season: input.season };
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
    } catch (cause) {
      if (!abort.signal.aborted) {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "The recommender failed");
      }
    } finally {
      controller.current = null;
      if (!abort.signal.aborted) setStatus((current) => current === "error" ? current : "idle");
    }
  }, [input.leagueId, input.season, input.teamId, input.workflow, status]);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setStatus("idle");
  }, []);

  return { run, cancel, result, status, error, clearError: () => { setError(null); setStatus("idle"); } };
}
