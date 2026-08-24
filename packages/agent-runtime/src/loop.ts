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
    const executions = new Map<string, Promise<unknown>>();
    const toolEvents = await Promise.all(response.calls.map(async (call): Promise<AgentEvent> => {
      throwIfAborted();
      const signature = `${call.name}:${JSON.stringify(call.input)}`;
      const repeats = (seen.get(signature) || 0) + 1;
      seen.set(signature, repeats);
      let execution = executions.get(signature);
      if (!execution) {
        execution = repeats > 2
          ? Promise.resolve({ error: "This identical tool call was stopped after repeated attempts." })
          : options.executeTool(call, options.thread).catch((error) => ({ error: error instanceof Error ? error.message : "Tool failed" }));
        executions.set(signature, execution);
      }
      const output = await execution;
      throwIfAborted();
      return { role: "tool", parts: [{ type: "tool-result", callId: call.id, name: call.name, output }] };
    }));
    events = toolEvents;
  }
  throw new Error("The assistant reached its maximum number of tool rounds for one run.");
}
