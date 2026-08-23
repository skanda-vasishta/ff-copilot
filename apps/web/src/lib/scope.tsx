"use client";

import { createContext, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";

export type ActiveScope = {
  team: {
    id: string;
    name: string;
    league_id: string;
    league: {
      id: string;
      name: string | null;
      external_id: string;
      season: number;
      scoring_format_label: string | null;
      last_synced_at: string | null;
    };
  };
};

type ScopeContextValue = {
  scope: ActiveScope | null;
  isLoading: boolean;
  setTeam: (teamId: string) => Promise<void>;
};

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const scopeQuery = useQuery({
    queryKey: ["active-scope"],
    queryFn: async () => {
      const { data: { user } } = await createClient().auth.getUser();
      if (!user) return null;
      const { data, error } = await createClient().from("user_active_scopes")
        .select("team:fantasy_teams(id,name,league_id,league:leagues(id,name,external_id,season,scoring_format_label,last_synced_at))")
        .eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data as unknown as ActiveScope | null;
    },
  });
  const mutation = useMutation({
    mutationFn: async (teamId: string) => {
      await api("/v1/me/teams", { method: "POST", body: JSON.stringify({ team_id: teamId }) });
      const { data: { user } } = await createClient().auth.getUser();
      if (!user) throw new Error("You must sign in");
      const { error } = await createClient().from("user_active_scopes")
        .upsert({ user_id: user.id, team_id: teamId, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["active-scope"] }),
  });
  return <ScopeContext.Provider value={{ scope: scopeQuery.data || null, isLoading: scopeQuery.isLoading, setTeam: mutation.mutateAsync }}>{children}</ScopeContext.Provider>;
}

export function useActiveScope() {
  const value = useContext(ScopeContext);
  if (!value) throw new Error("useActiveScope must be used inside ScopeProvider");
  return value;
}

