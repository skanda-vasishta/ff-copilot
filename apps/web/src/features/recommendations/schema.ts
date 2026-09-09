import { z } from "zod";

export const recommendationWorkflowSchema = z.enum(["free-agents", "trades", "lineup"]);
export type RecommendationWorkflow = z.infer<typeof recommendationWorkflowSchema>;

const position = z.enum(["QB", "RB", "WR", "TE"]);

const freeAgent = z.object({
  rank: z.number().int().min(1).max(5),
  player_id: z.string(),
  player_name: z.string(),
  position,
  nfl_team: z.string(),
  projected_points: z.number().nullable(),
  recommendation: z.string(),
  team_fit: z.string(),
  risk: z.string(),
  suggested_drop: z.string().nullable(),
}).strict();

export const freeAgentRecommendationsSchema = z.object({
  kind: z.literal("free_agents"),
  headline: z.string(),
  team_needs: z.array(z.string()),
  groups: z.array(z.object({
    position,
    recommendations: z.array(freeAgent).length(5),
  }).strict()).min(1).max(4),
  availability_as_of: z.string(),
  caveat: z.string(),
}).strict();

const tradeRecommendation = z.object({
  rank: z.number().int().min(1).max(5),
  target_player_id: z.string(),
  target_player_name: z.string(),
  position,
  target_team_id: z.string(),
  target_team_name: z.string(),
  offer_player_ids: z.array(z.string()),
  offer_player_names: z.array(z.string()),
  why_it_helps_you: z.string(),
  why_they_might_consider: z.string(),
  value_balance: z.string(),
  risk: z.string(),
}).strict();

export const tradeRecommendationsSchema = z.object({
  kind: z.literal("trades"),
  headline: z.string(),
  team_needs: z.array(z.string()),
  recommendations: z.array(tradeRecommendation).length(5),
  rosters_as_of: z.string(),
  caveat: z.string(),
}).strict();

const lineupAssignment = z.object({
  slot: z.string(),
  slot_index: z.number().int().min(1),
  player_id: z.string(),
  player_name: z.string(),
  position: z.string(),
  nfl_team: z.string().nullable(),
  projected_points: z.number().nullable(),
  reason: z.string(),
}).strict();

export const lineupRecommendationsSchema = z.object({
  kind: z.literal("lineup"),
  assignments: z.array(lineupAssignment),
  bench_player_ids: z.array(z.string()),
  lineup_as_of: z.string(),
  caveat: z.string(),
}).strict().superRefine((value, context) => {
  const playerIds = value.assignments.map((assignment) => assignment.player_id);
  const slotKeys = value.assignments.map((assignment) => `${assignment.slot.toUpperCase()}:${assignment.slot_index}`);
  if (new Set(playerIds).size !== playerIds.length) context.addIssue({ code: "custom", path: ["assignments"], message: "A player can only fill one lineup slot" });
  if (new Set(slotKeys).size !== slotKeys.length) context.addIssue({ code: "custom", path: ["assignments"], message: "Each lineup slot can only be assigned once" });
  if (value.bench_player_ids.some((id) => playerIds.includes(id))) context.addIssue({ code: "custom", path: ["bench_player_ids"], message: "A starter cannot also be on the bench" });
});

export type FreeAgentRecommendations = z.infer<typeof freeAgentRecommendationsSchema>;
export type TradeRecommendations = z.infer<typeof tradeRecommendationsSchema>;
export type LineupRecommendations = z.infer<typeof lineupRecommendationsSchema>;
export type RecommendationResult = FreeAgentRecommendations | TradeRecommendations | LineupRecommendations;

export function schemaForWorkflow(workflow: RecommendationWorkflow) {
  if (workflow === "free-agents") return freeAgentRecommendationsSchema;
  if (workflow === "trades") return tradeRecommendationsSchema;
  return lineupRecommendationsSchema;
}
