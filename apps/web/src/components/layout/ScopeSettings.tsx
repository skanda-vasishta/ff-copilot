"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useActiveScope } from "@/lib/scope";
import { createClient } from "@/lib/supabase/client";

type LinkedLeague = { state: "available" | "being_prepared"; league: { id: string; name: string | null; external_id: string; season: number; last_synced_at: string | null } };
type Team = { id: string; name: string; league_id: string };

export function ScopeSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const { scope, setTeam } = useActiveScope();
  const [leagueId, setLeagueId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [season, setSeason] = useState(2026);
  const leagues = useQuery({ queryKey: ["my-leagues"], queryFn: () => api<LinkedLeague[]>("/v1/me/leagues"), enabled: open });
  useEffect(() => {
    if (!leagueId && leagues.data?.length) setLeagueId(scope?.team.league_id || leagues.data[0].league.id);
  }, [leagueId, leagues.data, scope]);
  const teams = useQuery({ queryKey: ["league-teams", leagueId], queryFn: () => api<Team[]>(`/v1/leagues/${leagueId}/teams`), enabled: open && Boolean(leagueId) });
  const seasons = useQuery({ queryKey: ["league-seasons", leagueId], queryFn: () => api<LinkedLeague["league"][]>(`/v1/leagues/${leagueId}/seasons`), enabled: open && Boolean(leagueId) });
  const link = useMutation({
    mutationFn: () => api("/v1/me/leagues", { method: "POST", body: JSON.stringify({ provider: "espn", external_id: externalId.trim(), season }) }),
    onSuccess: () => { setExternalId(""); client.invalidateQueries({ queryKey: ["my-leagues"] }); },
  });
  if (!open) return null;
  function submit(event: FormEvent) { event.preventDefault(); link.mutate(); }

  return <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Workspace settings" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="h-full w-full max-w-md overflow-y-auto border-l border-white/[.08] bg-[#0c1013] p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#b7f34a]">Workspace settings</p><h2 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-white">Choose your team</h2><p className="mt-2 text-sm leading-6 text-[#78847e]">This selection scopes Team, Players, and every new Copilot thread.</p></div><button onClick={onClose} aria-label="Close settings" className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg border border-white/[.09] text-[#8c9992] hover:text-white">×</button></div>

      <section className="panel mt-7 rounded-2xl p-4">
        <label className="block text-[10px] font-semibold uppercase tracking-[.14em] text-[#65716b]">League</label>
        <select value={leagueId} onChange={(event) => setLeagueId(event.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-white/[.09] bg-[#090d10] px-3 py-3 text-sm text-white">
          {!leagues.data?.length && <option value="">No connected leagues</option>}
          {leagues.data?.filter(({ state }) => state === "available").map(({ league }) => <option key={league.id} value={league.id}>{league.name || `ESPN ${league.external_id}`} · {league.season}</option>)}
        </select>
        <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[.14em] text-[#65716b]">Season</label>
        <select aria-label="Workspace season" value={leagueId} onChange={(event) => setLeagueId(event.target.value)} className="focus-ring mt-2 w-full rounded-xl border border-white/[.09] bg-[#090d10] px-3 py-3 text-sm text-white">
          {seasons.data?.map((league) => <option key={league.id} value={league.id}>{league.season}</option>)}
        </select>
        <label className="mt-4 block text-[10px] font-semibold uppercase tracking-[.14em] text-[#65716b]">Your team</label>
        <div className="mt-2 grid gap-2">{teams.data?.map((team) => {
          const active = scope?.team.id === team.id;
          return <button key={team.id} onClick={async () => { await setTeam(team.id); onClose(); }} className={`focus-ring flex items-center justify-between rounded-xl border px-3.5 py-3 text-left text-sm transition ${active ? "border-[#b7f34a]/35 bg-[#b7f34a]/10 text-[#d7fb9e]" : "border-white/[.08] text-[#aab4af] hover:bg-white/[.04] hover:text-white"}`}><span>{team.name}</span><span>{active ? "Selected" : "Select"}</span></button>;
        })}</div>
        {teams.isLoading && <p className="py-4 text-xs text-[#65716b]">Loading teams…</p>}
      </section>

      <form onSubmit={submit} className="mt-6 border-t border-white/[.07] pt-6">
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#65716b]">Add another league</p>
        <div className="mt-3 grid grid-cols-[1fr_100px] gap-2"><input required inputMode="numeric" value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="ESPN league ID" className="focus-ring rounded-xl border border-white/[.09] bg-[#090d10] px-3 py-3 text-sm text-white placeholder:text-[#4f5a54]" /><input aria-label="Season" required type="number" min="2025" max="2100" value={season} onChange={(event) => setSeason(Number(event.target.value))} className="focus-ring rounded-xl border border-white/[.09] bg-[#090d10] px-3 py-3 text-sm text-white" /></div>
        {link.error && <p className="mt-2 text-xs text-red-300">{link.error.message}</p>}
        <button disabled={link.isPending} className="focus-ring mt-3 w-full rounded-xl border border-[#b7f34a]/25 bg-[#b7f34a]/10 px-3 py-3 text-sm font-semibold text-[#c8f775] hover:bg-[#b7f34a]/15 disabled:opacity-50">{link.isPending ? "Connecting…" : "Connect ESPN league"}</button>
      </form>
      <button onClick={async () => { await createClient().auth.signOut(); location.assign("/login"); }} className="focus-ring mt-8 w-full rounded-xl border border-white/[.08] px-3 py-3 text-sm text-[#8c9992] hover:border-red-300/20 hover:text-red-200">Sign out</button>
    </aside>
  </div>;
}
