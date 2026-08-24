import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AGENT_TOOLS, IN_SEASON_SYSTEM_PROMPT, validateToolInput } from "@/features/copilot/harness";
import type { AgentEvent, AgentMessage, MessagePart } from "@ff-copilot/agent-runtime";
import { ensureThreadContext, THREAD_CONTEXT_SELECT, type ContextThread } from "@/features/copilot/server/context";
import { completeAgentStep } from "@/features/copilot/server/model-provider";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { resolveAgentModelSettings } from "@/features/copilot/server/model-access";

export const runtime = "nodejs";
// Reasoning models can legitimately take longer than one minute, especially
// when a large persisted league context is supplied. Keep this below Vercel's
// production ceiling so the route returns the provider result instead of a
// platform-generated timeout.
export const maxDuration = 300;

function validEvent(event: AgentEvent) {
  if ((event.role !== "user" && event.role !== "tool") || !Array.isArray(event.parts) || event.parts.length !== 1) return false;
  const part = event.parts[0];
  if (event.role === "user") return part.type === "text" && part.text.trim().length > 0 && part.text.length <= 20_000;
  if (part.type !== "tool-result" || !part.callId || !part.name) return false;
  const serialized = JSON.stringify(part.output);
  return typeof serialized === "string" && serialized.length <= 200_000;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 250_000) return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  const body = await request.json().catch(() => null) as { threadId?: unknown; events?: unknown } | null;
  if (!body || typeof body.threadId !== "string") {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("agent_threads")
    .select(THREAD_CONTEXT_SELECT)
    .eq("id", body.threadId)
    .eq("user_id", user.id)
    .single();
  if (threadError || !thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const events = Array.isArray(body.events) ? body.events as AgentEvent[] : [];
  // Models may fan out one lookup per player. Keep a bounded batch, but do not
  // reject normal comparison requests containing more than eight tool calls.
  const validEvents = events.length > 0 && events.length <= 32 && events.every(validEvent);
  if (!validEvents) {
    console.warn("Rejected invalid agent event batch", {
      threadId: body.threadId,
      userId: user.id,
      eventCount: events.length,
      contentLength,
    });
    return NextResponse.json({ error: "Invalid agent events" }, { status: 400 });
  }
  if (events.length) {
    const { error: eventError } = await supabase.from("agent_messages").insert(events.map((event) => ({
      thread_id: thread.id,
      role: event.role,
      parts: event.parts,
    })));
    if (eventError) return NextResponse.json({ error: "Could not persist the thread event" }, { status: 500 });
  }

  const { data: messages, error: messagesError } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("thread_id", thread.id)
    .order("id");
  if (messagesError) return NextResponse.json({ error: "Could not load thread" }, { status: 500 });
  if (!messages?.length) return NextResponse.json({ error: "The thread has no messages" }, { status: 400 });

  const serializedContextSize = JSON.stringify(messages).length;
  if (serializedContextSize > 150_000) {
    return NextResponse.json({ error: "This conversation is too long. Start a new conversation to continue." }, { status: 413 });
  }

  const { error: quotaError } = await supabase.rpc("consume_agent_quota");
  if (quotaError) {
    const quotaMessages: Record<string, string> = {
      agent_rate_limit: "You're sending requests too quickly. Wait a second and try again.",
      agent_user_daily_limit: "You've reached today's Copilot usage limit. It resets at 00:00 UTC.",
      agent_global_daily_limit: "FF Copilot has reached its daily inference limit. It resets at 00:00 UTC.",
    };
    const key = Object.keys(quotaMessages).find((candidate) => quotaError.message.includes(candidate));
    return NextResponse.json({ error: key ? quotaMessages[key] : "Copilot usage is temporarily limited." }, { status: 429 });
  }

  let contextSnapshot: Record<string, unknown>;
  try {
    contextSnapshot = await ensureThreadContext(supabase, thread as unknown as ContextThread);
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not prepare league context" }, { status: 500 });
  }
  const previousSeason = thread.team.league.season - 1;
  const context = `\n\nAuthoritative daily league context (do not ask the user for facts present here):\n${JSON.stringify(contextSnapshot)}\nAll team names and compact rosters are already present. Use player tools for deeper rankings, projections, news, and source documents. Zero records and points before games are played mean preseason, not missing context. During preseason, ESPN position_rank is the ${previousSeason} positional finish—not a ${thread.team.league.season} draft, projection, or consensus rank. State that basis whenever using it.`;

  try {
    const modelSettings = await resolveAgentModelSettings(supabase);
    const completion = await completeAgentStep({
      model: modelSettings.model,
      reasoningEffort: modelSettings.reasoningEffort,
      instructions: IN_SEASON_SYSTEM_PROMPT + context,
      messages: messages as AgentMessage[],
      tools: [...AGENT_TOOLS] as ChatCompletionTool[],
    });
    if (completion.usage) {
      const { error: usageError } = await supabase.rpc("record_agent_usage", {
        p_input_tokens: completion.usage.inputTokens,
        p_output_tokens: completion.usage.outputTokens,
      });
      if (usageError) console.error("Could not record agent token usage", usageError.message);
    }
    if (completion.calls.length) {
      const calls = completion.calls.map((call) => {
        const input = validateToolInput(call.name, JSON.parse(call.arguments || "{}"));
        return { type: "tool-call" as const, id: call.id, name: call.name, input };
      });
      const parts: MessagePart[] = [
        ...completion.providerState.map((item) => ({ type: "provider-state" as const, item })),
        ...(completion.text ? [{ type: "text" as const, text: completion.text }] : []),
        ...calls,
      ];
      const { data: saved, error: saveError } = await supabase.from("agent_messages").insert({ thread_id: thread.id, role: "assistant", parts }).select().single();
      if (saveError) throw new Error("Could not persist the assistant response");
      return NextResponse.json({
        type: "tool-calls",
        text: completion.text,
        calls,
        message: saved,
      });
    }
    const finalText = completion.text?.trim();
    if (!finalText) {
      throw new Error(completion.refusal || "The model returned an empty response. Please retry.");
    }
    const { data: saved, error: saveError } = await supabase.from("agent_messages").insert({
      thread_id: thread.id,
      role: "assistant",
      parts: [...completion.providerState.map((item) => ({ type: "provider-state" as const, item })), { type: "text", text: finalText }],
    }).select().single();
    if (saveError) throw new Error("Could not persist the assistant response");
    return NextResponse.json({ type: "final", text: finalText, message: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inference failed";
    console.error("Agent inference failed", {
      threadId: thread.id,
      userId: user.id,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
