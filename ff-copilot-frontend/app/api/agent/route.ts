import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AGENT_TOOLS, IN_SEASON_SYSTEM_PROMPT } from "@/lib/agent/harness";
import type { AgentEvent, AgentMessage, MessagePart, ToolCallPart } from "@/lib/agent/types";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";
export const maxDuration = 60;

function text(parts: MessagePart[]) {
  return parts.filter((part) => part.type === "text").map((part) => part.text).join("\n");
}

function toModelMessages(messages: AgentMessage[]): ChatCompletionMessageParam[] {
  const output: ChatCompletionMessageParam[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      output.push({ role: "user", content: text(message.parts) });
      continue;
    }
    if (message.role === "assistant") {
      const calls = message.parts.filter((part): part is ToolCallPart => part.type === "tool-call");
      output.push({
        role: "assistant",
        content: text(message.parts) || null,
        ...(calls.length ? {
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: JSON.stringify(call.input) },
          })),
        } : {}),
      });
      continue;
    }
    for (const part of message.parts) {
      if (part.type === "tool-result") {
        output.push({
          role: "tool",
          tool_call_id: part.callId,
          content: JSON.stringify(part.output),
        });
      }
    }
  }
  return output;
}

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
    .select("*, team:fantasy_teams(id,name,external_id,wins,losses,ties,points_for,points_against,standing,league:leagues(id,name,season,provider,external_id,team_count,playoff_team_count,regular_season_weeks,scoring_type,reception_points,scoring_format_label,lineup_slot_counts,last_synced_at))")
    .eq("id", body.threadId)
    .eq("user_id", user.id)
    .single();
  if (threadError || !thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const events = Array.isArray(body.events) ? body.events as AgentEvent[] : [];
  const validEvents = events.length > 0 && events.length <= 8 && events.every(validEvent);
  if (!validEvents) return NextResponse.json({ error: "Invalid agent events" }, { status: 400 });
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

  const team = thread.team as unknown as { name?: string; league?: Record<string, unknown> } | null;
  let standings: Record<string, unknown>[] = [];
  if (thread.league_id) {
    const { data } = await supabase.from("fantasy_teams")
      .select("id,name,wins,losses,ties,points_for,points_against,standing,final_standing,playoff_pct")
      .eq("league_id", thread.league_id)
      .order("standing");
    standings = data || [];
  }
  const context = team
    ? `\n\nAuthoritative conversation context (do not ask the user for facts present here):\n${JSON.stringify({
        selected_team: { id: thread.team_id, name: team.name },
        league: team.league,
        standings,
      })}\nUse get_my_team for the selected roster, get_league_standings for refreshed standings, and get_league_team_roster for any opponent roster. Zero records and points before games are played mean preseason, not missing context.`
    : "\n\nConversation context: no fantasy team is attached to this thread. Ask the user to select one when personalized roster context is necessary.";

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured on the server" }, { status: 503 });
  }

  try {
    const completion = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
      model: process.env.AGENT_MODEL?.trim() || "gpt-5-nano",
      messages: [
        { role: "system", content: IN_SEASON_SYSTEM_PROMPT + context },
        ...toModelMessages(messages as AgentMessage[]),
      ],
      tools: [...AGENT_TOOLS] as OpenAI.Chat.Completions.ChatCompletionTool[],
      tool_choice: "auto",
      reasoning_effort: "minimal",
      // This budget includes hidden reasoning tokens. Real roster/tool results can
      // exhaust a smaller budget before the model emits any visible answer.
      max_completion_tokens: 1600,
    });
    const answer = completion.choices[0]?.message;
    if (!answer) throw new Error("The model returned no response");
    if (answer.tool_calls?.length) {
      const calls = answer.tool_calls.filter((call) => call.type === "function").map((call) => ({
        type: "tool-call" as const,
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments || "{}") as Record<string, unknown>,
      }));
      const parts: MessagePart[] = [
        ...(answer.content ? [{ type: "text" as const, text: answer.content }] : []),
        ...calls,
      ];
      const { data: saved, error: saveError } = await supabase.from("agent_messages").insert({ thread_id: thread.id, role: "assistant", parts }).select().single();
      if (saveError) throw new Error("Could not persist the assistant response");
      return NextResponse.json({
        type: "tool-calls",
        text: answer.content || undefined,
        calls,
        message: saved,
      });
    }
    const finalText = answer.content?.trim();
    if (!finalText) {
      throw new Error(answer.refusal || "The model returned an empty response. Please retry.");
    }
    const { data: saved, error: saveError } = await supabase.from("agent_messages").insert({
      thread_id: thread.id,
      role: "assistant",
      parts: [{ type: "text", text: finalText }],
    }).select().single();
    if (saveError) throw new Error("Could not persist the assistant response");
    return NextResponse.json({ type: "final", text: finalText, message: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inference failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
