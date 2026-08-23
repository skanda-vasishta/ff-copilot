import type { AgentEvent, ModelStep } from "./types";

export async function requestModelStep(threadId: string, events: AgentEvent[], signal?: AbortSignal): Promise<ModelStep> {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, events }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The assistant request failed");
  return body as ModelStep;
}
