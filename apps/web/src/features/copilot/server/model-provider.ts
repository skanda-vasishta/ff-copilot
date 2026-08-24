import OpenAI from "openai";
import type { ChatCompletionFunctionTool, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ResponseInput, ResponseInputItem, Tool as ResponseTool } from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";
import type { AgentMessage, MessagePart, ToolCallPart } from "@ff-copilot/agent-runtime";

export type AgentModelRequest = {
  model: string;
  reasoningEffort: ReasoningEffort;
  instructions: string;
  messages: AgentMessage[];
  tools: ChatCompletionTool[];
  previousResponseId?: string;
};

export type AgentModelResult = {
  text?: string;
  refusal?: string;
  calls: Array<{ id: string; name: string; arguments: string }>;
  providerState: unknown[];
  providerResponseId: string;
  usage?: { inputTokens: number; outputTokens: number };
};

function text(parts: MessagePart[]) {
  return parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

/**
 * Make persisted history safe to replay after a browser cancellation or failed
 * tool-result request. OpenAI requires every function call to have an output.
 * Missing outputs are inserted before the next user/assistant message, while
 * late orphaned outputs from a cancelled client are ignored.
 */
export function repairInterruptedToolCalls(messages: AgentMessage[]): AgentMessage[] {
  const repaired: AgentMessage[] = [];
  const pending = new Map<string, ToolCallPart>();
  let syntheticId = -1;

  const flushPending = () => {
    if (!pending.size) return;
    repaired.push({
      id: syntheticId--,
      thread_id: messages[0]?.thread_id || "",
      role: "tool",
      created_at: new Date(0).toISOString(),
      parts: [...pending.values()].map((call) => ({
        type: "tool-result" as const,
        callId: call.id,
        name: call.name,
        output: { error: "Tool execution was interrupted before its result was saved." },
      })),
    });
    pending.clear();
  };

  for (const message of messages) {
    if (pending.size && message.role !== "tool") flushPending();

    if (message.role === "tool") {
      const matched = message.parts.filter((part) => part.type === "tool-result" && pending.has(part.callId));
      if (matched.length) repaired.push({ ...message, parts: matched });
      for (const part of matched) if (part.type === "tool-result") pending.delete(part.callId);
      continue;
    }

    repaired.push(message);
    if (message.role === "assistant") {
      for (const part of message.parts) if (part.type === "tool-call") pending.set(part.id, part);
    }
  }
  flushPending();
  return repaired;
}

function toResponsesInput(messages: AgentMessage[]): ResponseInput {
  const output: ResponseInputItem[] = [];
  for (const message of messages) {
    if (message.role === "user") output.push({ role: "user", content: text(message.parts) });
    if (message.role === "assistant") {
      const messageText = text(message.parts);
      if (messageText) output.push({ role: "assistant", content: messageText });
      for (const part of message.parts) if (part.type === "tool-call") output.push({
        type: "function_call",
        call_id: part.id,
        name: part.name,
        arguments: JSON.stringify(part.input),
      });
    }
    if (message.role === "tool") for (const part of message.parts) if (part.type === "tool-result") output.push({
      type: "function_call_output",
      call_id: part.callId,
      output: JSON.stringify(part.output),
    });
  }
  return output;
}

function responsesTools(tools: ChatCompletionTool[]): ResponseTool[] {
  return tools.filter((tool): tool is ChatCompletionFunctionTool => tool.type === "function").map((tool) => ({
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters || null,
    strict: false,
  }));
}

async function completeWithResponses(client: OpenAI, request: AgentModelRequest): Promise<AgentModelResult> {
  const response = await client.responses.create({
    model: request.model,
    instructions: request.instructions,
    input: toResponsesInput(request.messages),
    tools: responsesTools(request.tools),
    tool_choice: "auto",
    reasoning: { effort: request.reasoningEffort },
    previous_response_id: request.previousResponseId,
    store: true,
  });
  const calls = response.output.filter((item) => item.type === "function_call").map((item) => ({
    id: item.call_id,
    name: item.name,
    arguments: item.arguments,
  }));
  return {
    text: response.output_text?.trim() || undefined,
    calls,
    providerState: [],
    providerResponseId: response.id,
    usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } : undefined,
  };
}

/** OpenAI Responses-backed model step with optional within-run continuation. */
export async function completeAgentStep(request: AgentModelRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server");
  const client = new OpenAI({ apiKey, baseURL: process.env.AGENT_PROVIDER_BASE_URL?.trim() || undefined });
  const repairedRequest = request.previousResponseId
    ? request
    : { ...request, messages: repairInterruptedToolCalls(request.messages) };
  return completeWithResponses(client, repairedRequest);
}
