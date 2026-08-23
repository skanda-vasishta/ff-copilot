import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOwnerModelAccess, OWNER_MODELS } from "@/features/copilot/server/model-access";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ models: await hasOwnerModelAccess(supabase) ? OWNER_MODELS : [] });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await hasOwnerModelAccess(supabase)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { threadId?: unknown; model?: unknown } | null;
  if (!body || typeof body.threadId !== "string" || typeof body.model !== "string") {
    return NextResponse.json({ error: "threadId and model are required" }, { status: 400 });
  }
  if (!OWNER_MODELS.some((model) => model.id === body.model)) return NextResponse.json({ error: "Unsupported model" }, { status: 400 });
  const { data, error } = await supabase.from("agent_threads").update({ model_id: body.model })
    .eq("id", body.threadId).eq("user_id", user.id).select().single();
  if (error || !data) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  return NextResponse.json({ thread: data });
}
