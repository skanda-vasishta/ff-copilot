import type { AgentEvent, ModelStep } from "@ff-copilot/agent-runtime";

export async function requestModelStep(threadId: string, events: AgentEvent[], runId?: string, signal?: AbortSignal): Promise<ModelStep> {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, runId, events }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The assistant request failed");
  return body as ModelStep;
}

export async function refreshThreadContext(threadId: string) {
  const response = await fetch("/api/agent/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not refresh context");
  return body as { context: { context_date_utc: string; refreshed_at: string } };
}

export type AgentModelOption = { id: string; label: string; efforts: string[] };
export type AgentModelSelection = { model: string; reasoningEffort: string };

export async function getAgentModels() {
  const response = await fetch("/api/agent/models");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not load models");
  return body as { models: AgentModelOption[]; selected?: AgentModelSelection };
}

export async function setAgentPreferences(model: string, reasoningEffort: string) {
  const response = await fetch("/api/agent/models", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, reasoningEffort }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Could not update model");
  return body as { selected: AgentModelSelection };
}
