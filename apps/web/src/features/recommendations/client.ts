import { createClient } from "@/lib/supabase/client";
import { schemaForWorkflow, type RecommendationResult, type RecommendationWorkflow } from "./schema";

type SavedRecommendation = {
  result: unknown;
  league_synced_at: string | null;
};

export async function loadRecommendation(input: {
  teamId: string;
  workflow: RecommendationWorkflow;
  leagueSyncedAt?: string | null;
}): Promise<RecommendationResult | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("recommendation_results")
    .select("result,league_synced_at")
    .eq("team_id", input.teamId)
    .eq("workflow", input.workflow)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const saved = data as SavedRecommendation;
  const currentSync = input.leagueSyncedAt ? Date.parse(input.leagueSyncedAt) : 0;
  const resultSync = saved.league_synced_at ? Date.parse(saved.league_synced_at) : 0;
  if (currentSync > resultSync) {
    await supabase.from("recommendation_results")
      .delete()
      .eq("team_id", input.teamId)
      .eq("workflow", input.workflow);
    return null;
  }
  return schemaForWorkflow(input.workflow).parse(saved.result) as RecommendationResult;
}

export async function saveRecommendation(input: {
  teamId: string;
  workflow: RecommendationWorkflow;
  position: "ALL" | "QB" | "RB" | "WR" | "TE";
  prompt: string;
  result: RecommendationResult;
  leagueSyncedAt?: string | null;
}) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error("You must sign in");
  const { error } = await createClient().from("recommendation_results").upsert({
    user_id: user.id,
    team_id: input.teamId,
    workflow: input.workflow,
    position: input.position,
    prompt: input.prompt,
    result: input.result,
    league_synced_at: input.leagueSyncedAt || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,team_id,workflow" });
  if (error) throw error;
}
