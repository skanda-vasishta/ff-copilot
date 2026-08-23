import OpenAI from "openai";
import type { ChatCompletionFunctionTool, ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ResponseInput, ResponseInputItem, Tool as ResponseTool } from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";
import type { AgentMessage, MessagePart, ToolCallPart } from "@ff-copilot/agent-runtime";

export type AgentModelRequest = {
  model: string;
  reasoningEffort: ReasoningEffort;
  instructions: string;
  messages: AgentMessage[];
  tools: ChatCompletionTool[];
};

export type AgentModelResult = {
  text?: string;
  refusal?: string;
  calls: Array<{ id: string; name: string; arguments: string }>;
  providerState: unknown[];
  usage?: { inputTokens: number; outputTokens: number };
};

function text(parts: MessagePart[]) {
  return parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

function toChatMessages(instructions: string, messages: AgentMessage[]): ChatCompletionMessageParam[] {
  const output: ChatCompletionMessageParam[] = [{ role: "system", content: instructions }];
  for (const message of messages) {
    if (message.role === "user") output.push({ role: "user", content: text(message.parts) });
    if (message.role === "assistant") {
      const calls = message.parts.filter((part): part is ToolCallPart => part.type === "tool-call");
      output.push({
        role: "assistant",
        content: text(message.parts) || null,
        ...(calls.length ? { tool_calls: calls.map((call) => ({
          id: call.id,
          type: "function" as const,
          function: { name: call.name, arguments: JSON.stringify(call.input) },
        })) } : {}),
      });
    }
    if (message.role === "tool") for (const part of message.parts) if (part.type === "tool-result") {
      output.push({ role: "tool", tool_call_id: part.callId, content: JSON.stringify(part.output) });
    }
  }
  return output;
}

function toResponsesInput(messages: AgentMessage[]): ResponseInput {
  const output: ResponseInputItem[] = [];
  for (const message of messages) {
    if (message.role === "user") output.push({ role: "user", content: text(message.parts) });
    if (message.role === "assistant") {
      for (const part of message.parts) if (part.type === "provider-state") output.push(part.item as ResponseInputItem);
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
    include: ["reasoning.encrypted_content"],
    store: false,
  });
  const calls = response.output.filter((item) => item.type === "function_call").map((item) => ({
    id: item.call_id,
    name: item.name,
    arguments: item.arguments,
  }));
  const providerState = response.output.filter((item) => item.type === "reasoning");
  return {
    text: response.output_text?.trim() || undefined,
    calls,
    providerState,
    usage: response.usage ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } : undefined,
  };
}

async function completeWithChat(client: OpenAI, request: AgentModelRequest): Promise<AgentModelResult> {
  const completion = await client.chat.completions.create({
    model: request.model,
    messages: toChatMessages(request.instructions, request.messages),
    tools: request.tools,
    tool_choice: "auto",
    reasoning_effort: request.reasoningEffort,
  });
  const answer = completion.choices[0]?.message;
  if (!answer) throw new Error("The model returned no response");
  return {
    text: answer.content?.trim() || undefined,
    refusal: answer.refusal || undefined,
    calls: (answer.tool_calls || []).filter((call) => call.type === "function").map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    })),
    providerState: [],
    usage: completion.usage ? { inputTokens: completion.usage.prompt_tokens, outputTokens: completion.usage.completion_tokens } : undefined,
  };
}

/** Model-specific OpenAI API routing behind one stable agent-provider result. */
export async function completeAgentStep(request: AgentModelRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server");
  const client = new OpenAI({ apiKey, baseURL: process.env.AGENT_PROVIDER_BASE_URL?.trim() || undefined });
  return request.model.startsWith("gpt-5.6-")
    ? completeWithResponses(client, request)
    : completeWithChat(client, request);
}
