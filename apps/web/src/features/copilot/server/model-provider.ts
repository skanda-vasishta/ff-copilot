import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

export type AgentModelRequest = {
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
    model: process.env.AGENT_MODEL?.trim() || "gpt-5-nano",
    messages: request.messages,
    tools: request.tools,
    tool_choice: "auto",
    reasoning_effort: "minimal",
  });
}
