import type { SupabaseClient } from "@supabase/supabase-js";

export const OWNER_MODELS = [
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", description: "Fastest · efficient everyday agent work" },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", description: "Balanced · stronger analysis" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", description: "Flagship · highest quality" },
] as const;

export type OwnerModelId = typeof OWNER_MODELS[number]["id"];

export async function hasOwnerModelAccess(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("has_agent_model_access");
  if (error) throw new Error("Could not verify model access");
  return data === true;
}

export async function resolveThreadModel(supabase: SupabaseClient, requested: string | null | undefined) {
  if (await hasOwnerModelAccess(supabase)) {
    return OWNER_MODELS.some((model) => model.id === requested) ? requested as OwnerModelId : OWNER_MODELS[0].id;
  }
  return process.env.AGENT_MODEL?.trim() || "gpt-5-nano";
}
