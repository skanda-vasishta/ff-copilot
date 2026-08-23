import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureThreadContext, THREAD_CONTEXT_SELECT, type ContextThread } from "@/features/copilot/server/context";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { threadId?: unknown } | null;
  if (!body || typeof body.threadId !== "string") return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  const { data, error } = await supabase.from("agent_threads").select(THREAD_CONTEXT_SELECT)
    .eq("id", body.threadId).eq("user_id", user.id).single();
  if (error || !data) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  try {
    const context = await ensureThreadContext(supabase, data as unknown as ContextThread, true);
    return NextResponse.json({ context });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not refresh context" }, { status: 500 });
  }
}
