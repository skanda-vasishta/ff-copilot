import type { AgentEvent, AgentMessage, AgentStatus, AgentThread } from "./types";

export async function runAgentLoop(options: {
  thread: AgentThread;
  signal: AbortSignal;
  onMessage: (message: AgentMessage) => void;
  onStatus: (status: AgentStatus) => void;
  initialEvent: AgentEvent;
  requestStep: (threadId: string, events: AgentEvent[], runId: string | undefined, signal: AbortSignal) => Promise<import("./types").ModelStep>;
  executeTool: (call: import("./types").ToolCallPart, thread: AgentThread) => Promise<unknown>;
}) {
  const throwIfAborted = () => {
    if (options.signal.aborted) throw new DOMException("The agent run was cancelled", "AbortError");
  };
  const seen = new Map<string, number>();
  let events = [options.initialEvent];
  let runId: string | undefined;
  for (let step = 0; step < 20; step += 1) {
    throwIfAborted();
    options.onStatus("responding");
    const response = await options.requestStep(options.thread.id, events, runId, options.signal);
    runId = response.runId;
    throwIfAborted();
    options.onMessage(response.message);
    if (response.type === "final") {
      options.onStatus("idle");
      return;
    }

    options.onStatus("running-tool");
    const toolEvents: AgentEvent[] = [];
    for (const call of response.calls) {
      throwIfAborted();
      const signature = `${call.name}:${JSON.stringify(call.input)}`;
      const repeats = (seen.get(signature) || 0) + 1;
      seen.set(signature, repeats);
      const output = repeats > 2
        ? { error: "This identical tool call was stopped after repeated attempts." }
        : await options.executeTool(call, options.thread).catch((error) => ({ error: error instanceof Error ? error.message : "Tool failed" }));
      throwIfAborted();
      toolEvents.push({ role: "tool", parts: [{ type: "tool-result", callId: call.id, name: call.name, output }] });
    }
    events = toolEvents;
  }
  throw new Error("The assistant reached its maximum number of tool rounds for one run.");
}
