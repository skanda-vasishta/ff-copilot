import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_OWNER_EFFORT,
  DEFAULT_OWNER_MODEL,
  hasOwnerModelAccess,
  OWNER_MODELS,
  validateOwnerSettings,
} from "@/features/copilot/server/model-access";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await hasOwnerModelAccess(supabase)) return NextResponse.json({ models: [] });
  const { data } = await supabase.from("agent_preferences").select("model_id,reasoning_effort").maybeSingle();
  const selected = validateOwnerSettings(data?.model_id, data?.reasoning_effort)
    || { model: DEFAULT_OWNER_MODEL, reasoningEffort: DEFAULT_OWNER_EFFORT };
  return NextResponse.json({ models: OWNER_MODELS, selected });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await hasOwnerModelAccess(supabase)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { model?: unknown; reasoningEffort?: unknown } | null;
  const selected = validateOwnerSettings(body?.model, body?.reasoningEffort);
  if (!selected) return NextResponse.json({ error: "Unsupported model or reasoning effort" }, { status: 400 });
  const { error } = await supabase.from("agent_preferences").upsert({
    user_id: user.id,
    model_id: selected.model,
    reasoning_effort: selected.reasoningEffort,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Could not save model preferences" }, { status: 500 });
  return NextResponse.json({ selected });
}
