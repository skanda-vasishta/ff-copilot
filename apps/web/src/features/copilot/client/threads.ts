import { createClient } from "@/lib/supabase/client";
import type { AgentMessage, AgentThread } from "@ff-copilot/agent-runtime";

export async function listThreads(teamId: string) {
  const { data, error } = await createClient()
    .from("agent_threads")
    .select("*")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as AgentThread[];
}

export async function createThread(input: { teamId?: string; leagueId?: string }) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error("You must sign in");
  const { data, error } = await createClient()
    .from("agent_threads")
    .insert({ user_id: user.id, team_id: input.teamId || null, league_id: input.leagueId || null })
    .select()
    .single();
  if (error) throw error;
  return data as AgentThread;
}

export async function updateThread(id: string, patch: Partial<Pick<AgentThread, "title" | "team_id" | "league_id">>) {
  const { data, error } = await createClient().from("agent_threads").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as AgentThread;
}

export async function deleteThread(id: string) {
  const { error } = await createClient().from("agent_threads").delete().eq("id", id);
  if (error) throw error;
}

export async function getMessages(threadId: string) {
  const { data, error } = await createClient()
    .from("agent_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("id");
  if (error) throw error;
  return data as AgentMessage[];
}
