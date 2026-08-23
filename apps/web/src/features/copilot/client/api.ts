import type { AgentEvent, ModelStep } from "@ff-copilot/agent-runtime";

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
