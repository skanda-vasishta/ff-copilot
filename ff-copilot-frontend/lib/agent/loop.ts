import { requestModelStep } from "./api";
import { executeTool } from "./tools";
import type { AgentEvent, AgentMessage, AgentStatus, AgentThread } from "./types";

export async function runAgentLoop(options: {
  thread: AgentThread;
  signal: AbortSignal;
  onMessage: (message: AgentMessage) => void;
  onStatus: (status: AgentStatus) => void;
  initialEvent: AgentEvent;
}) {
  const seen = new Map<string, number>();
  let events = [options.initialEvent];
  for (let step = 0; step < 8; step += 1) {
    options.onStatus("responding");
    const response = await requestModelStep(options.thread.id, events, options.signal);
    options.onMessage(response.message);
    if (response.type === "final") {
      options.onStatus("idle");
      return;
    }

    options.onStatus("running-tool");
    const toolEvents: AgentEvent[] = [];
    for (const call of response.calls) {
      const signature = `${call.name}:${JSON.stringify(call.input)}`;
      const repeats = (seen.get(signature) || 0) + 1;
      seen.set(signature, repeats);
      const output = repeats > 2
        ? { error: "This identical tool call was stopped after repeated attempts." }
        : await executeTool(call, options.thread).catch((error) => ({ error: error instanceof Error ? error.message : "Tool failed" }));
      toolEvents.push({ role: "tool", parts: [{ type: "tool-result", callId: call.id, name: call.name, output }] });
    }
    events = toolEvents;
  }
  throw new Error("The assistant reached its maximum number of tool steps.");
}
