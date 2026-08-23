import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ReasoningEffort } from "openai/resources/shared";

export type AgentModelRequest = {
  model: string;
  reasoningEffort: ReasoningEffort;
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
};

/** The single server-side boundary to an OpenAI-compatible inference provider. */
export async function completeAgentStep(request: AgentModelRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server");
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.AGENT_PROVIDER_BASE_URL?.trim() || undefined,
  });
  return client.chat.completions.create({
    model: request.model,
    messages: request.messages,
    tools: request.tools,
    tool_choice: "auto",
    reasoning_effort: request.reasoningEffort,
  });
}
