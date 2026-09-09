"use client";

import { createContext, useContext, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";

export type ActiveScope = {
  team: {
    id: string;
    name: string;
    external_id: string;
    league_id: string;
    league: {
      id: string;
      name: string | null;
      external_id: string;
      provider: "espn" | "sleeper";
      season: number;
      scoring_format_label: string | null;
      lineup_slot_counts: Record<string, number>;
      last_synced_at: string | null;
    };
  };
};

type ScopeContextValue = {
  scope: ActiveScope | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refreshError: string | null;
  setTeam: (teamId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const scopeQuery = useQuery({
    queryKey: ["active-scope"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return null;
      const { data, error } = await supabase.from("user_active_scopes")
        .select("team:fantasy_teams(id,name,external_id,league_id,league:leagues(id,name,external_id,provider,season,scoring_format_label,lineup_slot_counts,last_synced_at))")
        .eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data as unknown as ActiveScope | null;
    },
  });
  const mutation = useMutation({
    mutationFn: async (teamId: string) => {
      await api("/v1/me/teams", { method: "POST", body: JSON.stringify({ team_id: teamId }) });
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("You must sign in");
      const { error } = await supabase.from("user_active_scopes")
        .upsert({ user_id: user.id, team_id: teamId, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-scope"] }),
  });
  async function refresh() {
    if (isRefreshing || !scopeQuery.data) return;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const response = await fetch("/api/league/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: scopeQuery.data.team.league.id }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Could not refresh league");
      await queryClient.invalidateQueries({ refetchType: "active" });
      await scopeQuery.refetch();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not refresh league");
      throw error;
    } finally {
      setIsRefreshing(false);
    }
  }
  return <ScopeContext.Provider value={{ scope: scopeQuery.data || null, isLoading: scopeQuery.isLoading, isRefreshing, refreshError, setTeam: mutation.mutateAsync, refresh }}>{children}</ScopeContext.Provider>;
}

export function useActiveScope() {
  const value = useContext(ScopeContext);
  if (!value) throw new Error("useActiveScope must be used inside ScopeProvider");
  return value;
}
