import { NextResponse } from "next/server";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { AGENT_TOOLS, DRAFT_AGENT_TOOLS, IN_SEASON_SYSTEM_PROMPT, validateToolInput } from "@/features/copilot/harness";
import type { AgentEvent, AgentMessage, MessagePart } from "@ff-copilot/agent-runtime";
import { ensureThreadContext, formatThreadContext, THREAD_CONTEXT_SELECT, type ContextThread } from "@/features/copilot/server/context";
import { completeAgentStep } from "@/features/copilot/server/model-provider";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { resolveAgentModelSettings } from "@/features/copilot/server/model-access";
import { buildDraftContext, DRAFT_SYSTEM_PROMPT } from "@/features/draft/server/context";

export const runtime = "nodejs";
// Reasoning models can legitimately take longer than one minute, especially
// when a large persisted league context is supplied. Keep this below Vercel's
// production ceiling so the route returns the provider result instead of a
// platform-generated timeout.
export const maxDuration = 300;

function inferenceHistory(messages: AgentMessage[]) {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.filter((part) => part.type !== "provider-state"),
  })).filter((message) => message.parts.length > 0);
}

function validEvent(event: AgentEvent) {
  if ((event.role !== "user" && event.role !== "tool") || !Array.isArray(event.parts) || event.parts.length !== 1) return false;
  const part = event.parts[0];
  if (event.role === "user") return part.type === "text" && part.text.trim().length > 0 && part.text.length <= 20_000;
  if (part.type !== "tool-result" || !part.callId || !part.name) return false;
  const serialized = JSON.stringify(part.output);
  return typeof serialized === "string" && serialized.length <= 200_000;
}

type AgentRunCheckpoint = {
  type: "agent-run";
  id: string;
  modelId: string;
  reasoningEffort: string;
  instructions: string;
  providerResponseId: string;
  stepCount: number;
  inputTokens: number;
  outputTokens: number;
  status: "running" | "completed";
  signature: string;
};

function runSignature(run: Omit<AgentRunCheckpoint, "signature">, threadId: string, userId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured on the server");
  return createHmac("sha256", secret)
    .update([run.id, threadId, userId, run.modelId, run.reasoningEffort, run.instructions, run.providerResponseId, run.stepCount, run.inputTokens, run.outputTokens, run.status].join("\u0000"))
    .digest("hex");
}

function validRunSignature(run: AgentRunCheckpoint, threadId: string, userId: string) {
  const { signature: _signature, ...unsigned } = run;
  const expected = Buffer.from(runSignature(unsigned, threadId, userId), "hex");
  const actual = Buffer.from(run.signature || "", "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function checkpointPart(run: Omit<AgentRunCheckpoint, "signature">, threadId: string, userId: string): MessagePart {
  return { type: "provider-state", item: { ...run, signature: runSignature(run, threadId, userId) } };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 250_000) return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  const body = await request.json().catch(() => null) as { threadId?: unknown; runId?: unknown; events?: unknown } | null;
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
  const validEvents = events.length > 0 && events.every(validEvent);
  if (!validEvents) {
    console.warn("Rejected invalid agent event batch", {
      threadId: body.threadId,
      userId: user.id,
      eventCount: events.length,
      contentLength,
    });
    return NextResponse.json({ error: "Invalid agent events" }, { status: 400 });
  }
  // Event role defines the protocol phase. A just-deployed server may receive
  // tool results from a tab running the previous client bundle, which does not
  // yet send runId; recover the latest signed checkpoint in that case.
  const continuing = events.every((event) => event.role === "tool");
  if (continuing ? events.some((event) => event.role !== "tool") : events.length !== 1 || events[0].role !== "user") {
    return NextResponse.json({ error: continuing ? "A run continuation requires tool results" : "A new run requires one user message" }, { status: 400 });
  }

  let run: Omit<AgentRunCheckpoint, "signature">;
  let inferenceMessages: AgentMessage[];
  let previousResponseId: string | undefined;

  try {
    if (continuing) {
      const { data: assistantMessages, error } = await supabase.from("agent_messages")
        .select("parts")
        .eq("thread_id", thread.id)
        .eq("role", "assistant")
        .order("id", { ascending: false })
        .limit(100);
      const requestedRunId = typeof body.runId === "string" ? body.runId : undefined;
      const checkpoint = assistantMessages?.flatMap((message) => message.parts as MessagePart[])
        .filter((part) => part.type === "provider-state")
        .map((part) => part.type === "provider-state" ? part.item as AgentRunCheckpoint : null)
        .find((item) => item?.type === "agent-run" && item.status === "running" && (!requestedRunId || item.id === requestedRunId));
      if (error || !checkpoint?.providerResponseId || checkpoint.status !== "running") {
        return NextResponse.json({ error: "This agent run can no longer be continued" }, { status: 409 });
      }
      if (!validRunSignature(checkpoint, thread.id, user.id)) {
        return NextResponse.json({ error: "This agent run is invalid" }, { status: 409 });
      }
      const { signature: _signature, ...unsignedCheckpoint } = checkpoint;
      run = unsignedCheckpoint;
      previousResponseId = run.providerResponseId;
      const { data: savedEvents, error: eventError } = await supabase.from("agent_messages").insert(events.map((event) => ({
        thread_id: thread.id,
        role: event.role,
        parts: event.parts,
      }))).select();
      if (eventError || !savedEvents) throw new Error("Could not persist the tool results");
      inferenceMessages = savedEvents as AgentMessage[];
    } else {
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

      const { error: eventError } = await supabase.from("agent_messages").insert({
        thread_id: thread.id,
        role: events[0].role,
        parts: events[0].parts,
      });
      if (eventError) throw new Error("Could not persist the user message");

      const { data: messages, error: messagesError } = await supabase.from("agent_messages")
        .select("*").eq("thread_id", thread.id).order("id");
      if (messagesError || !messages?.length) throw new Error("Could not load the thread");
      inferenceMessages = inferenceHistory(messages as AgentMessage[]);

      const isDraft = Boolean((thread as unknown as { draft_session_id?: string | null }).draft_session_id);
      let instructions: string;
      if (isDraft) {
        const context = await buildDraftContext(supabase, (thread as unknown as { draft_session_id: string }).draft_session_id, user.id);
        instructions = `${DRAFT_SYSTEM_PROMPT}\n\n${context}`;
      } else {
        const contextSnapshot = await ensureThreadContext(supabase, thread as unknown as ContextThread);
        const previousSeason = thread.team.league.season - 1;
        const context = `\n\n${formatThreadContext(contextSnapshot)}\n\nContext rules: All team names and rosters are already present. Treat roster ownership as authoritative: before proposing a trade, verify every outgoing player is on the stated sender and every incoming player is on a different team; never recommend acquiring a player the user already owns. Use get_consensus_rankings for ranked lists and player tools for projection consensus, per-source breakdowns, news, and source documents. A positional consensus combines the latest compatible ESPN platform rank, FantasyPros expert consensus rank, and FFToday projection-derived rank; preserve those labels and never imply they are the same methodology. Zero records and points before games are played mean preseason, not missing context. Projection policy: use only cumulative full-season PPR consensus fields explicitly labeled for the ${thread.team.league.season} season. Never present ${previousSeason} projections as current; ${previousSeason} data may be used only as completed historical ground truth. During preseason, ESPN position_rank in a statistical snapshot is the ${previousSeason} positional finish—not a ${thread.team.league.season} draft, projection, or consensus rank. State that basis whenever using it. Older source documents may provide historical context but must not override ${thread.team.league.season} projections.`;
        instructions = IN_SEASON_SYSTEM_PROMPT + context;
      }
      const modelSettings = await resolveAgentModelSettings(supabase);
      run = {
        type: "agent-run",
        id: randomUUID(),
        modelId: modelSettings.model,
        reasoningEffort: modelSettings.reasoningEffort || "none",
        instructions,
        providerResponseId: "",
        stepCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        status: "running",
      };
    }

    const completion = await completeAgentStep({
      model: run.modelId,
      reasoningEffort: run.reasoningEffort as Parameters<typeof completeAgentStep>[0]["reasoningEffort"],
      instructions: run.instructions,
      messages: inferenceMessages,
      tools: [...((thread as unknown as { draft_session_id?: string | null }).draft_session_id ? DRAFT_AGENT_TOOLS : AGENT_TOOLS)] as ChatCompletionTool[],
      previousResponseId,
    });
    if (completion.usage) {
      const { error: usageError } = await supabase.rpc("record_agent_usage", {
        p_input_tokens: completion.usage.inputTokens,
        p_output_tokens: completion.usage.outputTokens,
      });
      if (usageError) console.error("Could not record agent token usage", usageError.message);
    }
    run = {
      ...run,
      providerResponseId: completion.providerResponseId,
      stepCount: run.stepCount + 1,
      inputTokens: run.inputTokens + (completion.usage?.inputTokens || 0),
      outputTokens: run.outputTokens + (completion.usage?.outputTokens || 0),
      status: completion.calls.length ? "running" : "completed",
    };

    if (completion.calls.length) {
      const calls = completion.calls.map((call) => {
        const input = validateToolInput(call.name, JSON.parse(call.arguments || "{}"));
        return { type: "tool-call" as const, id: call.id, name: call.name, input };
      });
      const parts: MessagePart[] = [
        checkpointPart(run, thread.id, user.id),
        ...(completion.text ? [{ type: "text" as const, text: completion.text }] : []),
        ...calls,
      ];
      const { data: saved, error: saveError } = await supabase.from("agent_messages").insert({ thread_id: thread.id, role: "assistant", parts }).select().single();
      if (saveError) throw new Error("Could not persist the assistant response");
      return NextResponse.json({
        type: "tool-calls",
        runId: run.id,
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
      parts: [checkpointPart(run, thread.id, user.id), { type: "text", text: finalText }],
    }).select().single();
    if (saveError) throw new Error("Could not persist the assistant response");
    return NextResponse.json({ type: "final", runId: run.id, text: finalText, message: saved });
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
