import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReasoningEffort } from "openai/resources/shared";

export const OWNER_MODELS = [
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", efforts: ["none", "low", "medium", "high", "xhigh"] },
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", efforts: ["none", "low", "medium", "high", "xhigh"] },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", efforts: ["none", "low", "medium", "high", "xhigh"] },
  { id: "gpt-5-nano", label: "GPT-5 Nano", efforts: ["minimal", "low", "medium", "high"] },
] as const;

export type OwnerModelId = typeof OWNER_MODELS[number]["id"];
export const DEFAULT_OWNER_MODEL: OwnerModelId = "gpt-5.6-luna";
export const DEFAULT_OWNER_EFFORT = "low";

export async function hasOwnerModelAccess(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("has_agent_model_access");
  if (error) throw new Error("Could not verify model access");
  return data === true;
}

export function validateOwnerSettings(modelId: unknown, effort: unknown) {
  const model = OWNER_MODELS.find((candidate) => candidate.id === modelId);
  if (!model) return null;
  if (!model.efforts.some((candidate) => candidate === effort)) return null;
  return { model: model.id, reasoningEffort: effort as ReasoningEffort };
}

export async function resolveAgentModelSettings(supabase: SupabaseClient) {
  if (!await hasOwnerModelAccess(supabase)) {
    return {
      model: process.env.AGENT_MODEL?.trim() || "gpt-5-nano",
      reasoningEffort: (process.env.AGENT_REASONING_EFFORT?.trim() || "low") as ReasoningEffort,
    };
  }
  const { data } = await supabase.from("agent_preferences").select("model_id,reasoning_effort").maybeSingle();
  return validateOwnerSettings(data?.model_id, data?.reasoning_effort)
    || { model: DEFAULT_OWNER_MODEL, reasoningEffort: DEFAULT_OWNER_EFFORT as ReasoningEffort };
}
