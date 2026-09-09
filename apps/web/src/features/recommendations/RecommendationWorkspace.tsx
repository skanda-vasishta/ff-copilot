"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveScope } from "@/lib/scope";
import { PlayerDetailModal } from "@/components/features/players/PlayerDetailModal";
import { getAgentModels, setAgentPreferences, type AgentModelSelection } from "@/features/copilot/client/api";
import { useRecommendationAgent } from "./useRecommendationAgent";
import type { FreeAgentRecommendations, RecommendationWorkflow, TradeRecommendations } from "./schema";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"] as const;

export function RecommendationWorkspace({ workflow }: { workflow: RecommendationWorkflow }) {
  const { scope, isLoading } = useActiveScope();
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>("ALL");
  const [customPrompt, setCustomPrompt] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [modelSelection, setModelSelection] = useState<AgentModelSelection | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const models = useQuery({ queryKey: ["agent-models"], queryFn: getAgentModels });
  const agent = useRecommendationAgent({ workflow, teamId: scope?.team.id, leagueId: scope?.team.league_id, season: scope?.team.league.season, leagueSyncedAt: scope?.team.league.last_synced_at });
  const busy = agent.status !== "idle" && agent.status !== "error";
  const isFreeAgents = workflow === "free-agents";

  useEffect(() => {
    if (models.data?.selected && !savingModel) setModelSelection(models.data.selected);
  }, [models.data?.selected, savingModel]);

  async function chooseModel(model: string) {
    const option = models.data?.models.find((candidate) => candidate.id === model);
    if (!option) return;
    const previous = modelSelection;
    const effort = modelSelection?.reasoningEffort && option.efforts.includes(modelSelection.reasoningEffort)
      ? modelSelection.reasoningEffort : option.efforts[0];
    setModelSelection({ model, reasoningEffort: effort });
    setSavingModel(true);
    setSettingsError(null);
    try {
      const saved = await setAgentPreferences(model, effort);
      setModelSelection(saved.selected);
      await models.refetch();
    } catch (cause) {
      setModelSelection(previous);
      setSettingsError(cause instanceof Error ? cause.message : "Could not save model preference");
    } finally { setSavingModel(false); }
  }

  async function chooseReasoning(reasoningEffort: string) {
    if (!modelSelection?.model) return;
    const previous = modelSelection;
    setModelSelection({ model: modelSelection.model, reasoningEffort });
    setSavingModel(true);
    setSettingsError(null);
    try {
      const saved = await setAgentPreferences(modelSelection.model, reasoningEffort);
      setModelSelection(saved.selected);
      await models.refetch();
    } catch (cause) {
      setModelSelection(previous);
      setSettingsError(cause instanceof Error ? cause.message : "Could not save reasoning preference");
    } finally { setSavingModel(false); }
  }

  function prompt() {
    const positionInstruction = position === "ALL"
      ? isFreeAgents ? "Evaluate QB, RB, WR, and TE and return five recommendations in every position group." : "Consider all fantasy positions."
      : `Focus only on ${position}.`;
    const userDirection = customPrompt.trim() ? `Additional manager direction: ${customPrompt.trim()}` : "Prioritize the largest weaknesses and best risk-adjusted upside for my roster.";
    return isFreeAgents
      ? `Run the free-agent recommender for my team. ${positionInstruction} ${userDirection} Verify current league availability with tools and return only the required structured result.`
      : `Run the trade recommender for my team. ${positionInstruction} ${userDirection} Inspect the relevant other teams and their rosters with tools, construct five realistic roster-valid offers, and return only the required structured result.`;
  }

  function runRecommendations() {
    const request = prompt();
    setCustomPrompt("");
    void agent.run(request);
  }

  if (isLoading) return <div className="mx-auto max-w-[1120px] p-8 text-sm text-[#8a9280]">Loading your workspace…</div>;
  if (!scope) return <div className="mx-auto max-w-xl px-5 py-24 text-center"><h1 className="text-2xl font-semibold text-white">Select a team first</h1><p className="mt-3 text-sm text-[#78847e]">Recommendations need a connected league and roster.</p><Link href="/settings" className="mt-5 inline-flex h-9 items-center rounded-[6px] bg-[#c9f958] px-4 text-xs font-semibold text-[#11170a]">Open settings</Link></div>;

  return <div className="mx-auto max-w-[1120px] px-4 py-7 sm:px-6 lg:px-8">
    <header className="rounded-[18px] border border-white/[.08] bg-[#181a16]/60 px-5 py-5 backdrop-blur-xl sm:px-6">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
        <div><h1 className="text-[28px] font-semibold tracking-[-.03em] text-[#eef1e9]">{isFreeAgents ? "Free agent recommender" : "Trade recommender"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#8a9280]">{isFreeAgents ? "Copilot researches your live league pool and ranks the five best fits at each position." : "Copilot studies every roster in your league and proposes five team-aware trade offers."}</p></div>
        <div className="flex flex-wrap items-center justify-end gap-1"><div className="flex rounded-[8px] border border-white/[.06] bg-black/15 p-1"><Link href="/free-agents" className={`rounded-[5px] px-3 py-2 text-[11px] ${isFreeAgents ? "bg-[#c9f958] font-semibold text-[#11170a]" : "text-[#8a9280]"}`}>Free agents</Link><Link href="/trade-tool" className={`rounded-[5px] px-3 py-2 text-[11px] ${!isFreeAgents ? "bg-[#c9f958] font-semibold text-[#11170a]" : "text-[#8a9280]"}`}>Trades</Link></div>{models.data?.models.length && modelSelection ? <><select aria-label="Model" value={modelSelection.model} onChange={(event) => chooseModel(event.target.value)} disabled={busy || savingModel} className="focus-ring h-9 max-w-40 rounded-[7px] border border-white/[.06] bg-black/15 px-2 text-[10px] text-[#9ca497] outline-none disabled:opacity-35">{models.data.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select><select aria-label="Reasoning effort" value={modelSelection.reasoningEffort} onChange={(event) => chooseReasoning(event.target.value)} disabled={busy || savingModel} className="focus-ring h-9 max-w-28 rounded-[7px] border border-white/[.06] bg-black/15 px-2 text-[10px] capitalize text-[#9ca497] outline-none disabled:opacity-35">{models.data.models.find((model) => model.id === modelSelection.model)?.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></> : null}</div>
      </div>
      <div className="mt-6 grid gap-3 lg:grid-cols-[auto_minmax(240px,1fr)_auto]">
        <div className="flex flex-wrap gap-1 rounded-[8px] border border-white/[.06] bg-black/15 p-1">{POSITIONS.map((item) => <button key={item} onClick={() => setPosition(item)} disabled={busy} className={`h-8 rounded-[5px] px-3 text-[10px] font-semibold ${position === item ? "bg-white/[.1] text-white" : "text-[#78847e] hover:text-white"}`}>{item}</button>)}</div>
        <input value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} disabled={busy} placeholder={isFreeAgents ? "Optional: prefer upside, avoid injured players…" : "Optional: don't move my RB1, target a WR…"} className="h-10 rounded-[8px] border border-white/[.07] bg-black/15 px-3 text-xs text-white outline-none placeholder:text-[#5f6659] focus:border-[#c9f958]/30" />
        {busy ? <button onClick={agent.cancel} className="h-10 rounded-[7px] border border-red-300/20 px-5 text-xs text-red-200">Stop</button> : <button onClick={runRecommendations} className="h-10 rounded-[7px] bg-gradient-to-br from-[#d9ff6e] to-[#a8e63c] px-5 text-xs font-semibold text-[#12200a]">{agent.result ? "Ask again" : "Get recommendations"}</button>}
      </div>
    </header>

    {busy && <div className="mt-5 flex items-center gap-3 rounded-[12px] border border-[#c9f958]/15 bg-[#c9f958]/[.04] px-5 py-4 text-xs text-[#aeb5a8]"><span className="size-2 animate-pulse rounded-full bg-[#b7f34a]" />{agent.status === "running-tool" ? "Researching league rosters and player data…" : "Building recommendations…"}</div>}
    {settingsError && <div role="alert" className="mt-3 text-xs text-red-200">{settingsError}</div>}
    {agent.error && <div role="alert" className="mt-5 flex items-center justify-between rounded-[10px] border border-red-400/20 bg-red-400/[.04] px-4 py-3 text-xs text-red-200"><span>{agent.error}</span><button onClick={agent.clearError} className="underline">Dismiss</button></div>}
    {agent.loadingResult && <div className="mt-5 rounded-[14px] border border-white/[.06] px-6 py-20 text-center text-sm text-[#78847e]">Loading saved recommendations…</div>}
    {!agent.result && !busy && !agent.loadingResult && <div className="mt-5 rounded-[14px] border border-dashed border-white/[.08] px-6 py-20 text-center"><span className="text-xl text-[#b7f34a]">✦</span><h2 className="mt-4 text-lg font-semibold text-white">Ready to research your league</h2><p className="mt-2 text-sm text-[#78847e]">Choose a position, optionally steer the agent, and start a run.</p></div>}
    {agent.result?.kind === "free_agents" && <FreeAgentResults result={agent.result} position={position} onSelectPlayer={setSelectedPlayerId} />}
    {agent.result?.kind === "trades" && <TradeResults result={agent.result} position={position} onSelectPlayer={setSelectedPlayerId} />}
    {selectedPlayerId && <PlayerDetailModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />}
  </div>;
}

function ResultHeader({ headline, needs, freshness, caveat }: { headline: string; needs: string[]; freshness: string; caveat: string }) {
  return <div className="mb-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[10px] uppercase tracking-[.1em] text-[#7f8a79]">Team needs</p><h2 className="mt-1 text-xl font-semibold text-white">{headline}</h2></div><p className="font-mono text-[10px] text-[#626c61]">Data as of {freshness}</p></div><div className="mt-3 flex flex-wrap gap-1.5">{needs.map((need) => <span key={need} className="rounded-full border border-[#c9f958]/15 bg-[#c9f958]/[.055] px-2.5 py-1 text-[10px] text-[#b9d879]">{need}</span>)}</div><p className="mt-3 text-xs leading-5 text-[#727c70]">{caveat}</p></div>;
}

function FreeAgentResults({ result, position, onSelectPlayer }: { result: FreeAgentRecommendations; position: (typeof POSITIONS)[number]; onSelectPlayer: (id: string) => void }) {
  const groups = position === "ALL" ? result.groups : result.groups.filter((group) => group.position === position);
  return <section className="mt-7"><ResultHeader headline={result.headline} needs={result.team_needs} freshness={result.availability_as_of} caveat={result.caveat} />{groups.length ? <div className="space-y-6">{groups.map((group) => <div key={group.position}><h3 className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-[#9dbe4e]">{group.position}</h3><div className="grid gap-2">{group.recommendations.map((item) => <article key={`${group.position}-${item.rank}-${item.player_id}`} className="grid gap-3 rounded-[12px] border border-white/[.065] bg-white/[.022] p-4 sm:grid-cols-[32px_minmax(150px,.7fr)_minmax(260px,1.5fr)]"><span className="font-mono text-sm text-[#78847e]">#{item.rank}</span><div><button type="button" onClick={() => onSelectPlayer(item.player_id)} className="focus-ring rounded text-left font-semibold text-white underline decoration-white/15 underline-offset-4 transition hover:text-[#d6fb7a] hover:decoration-[#c9f958]/50">{item.player_name}</button><p className="mt-1 text-[10px] text-[#697368]">{item.position} · {item.nfl_team}{item.projected_points != null ? ` · ${item.projected_points.toFixed(1)} proj.` : ""}</p>{item.suggested_drop && <p className="mt-2 text-[10px] text-[#b8c0b3]">Possible drop: {item.suggested_drop}</p>}</div><div className="text-xs leading-5 text-[#9da598]"><p>{item.recommendation}</p><p className="mt-1 text-[#78847e]">Fit: {item.team_fit}</p><p className="mt-1 text-amber-100/55">Risk: {item.risk}</p></div></article>)}</div></div>)}</div> : <NoResultsForPosition position={position} />}</section>;
}

function TradeResults({ result, position, onSelectPlayer }: { result: TradeRecommendations; position: (typeof POSITIONS)[number]; onSelectPlayer: (id: string) => void }) {
  const recommendations = position === "ALL" ? result.recommendations : result.recommendations.filter((item) => item.position === position);
  return <section className="mt-7"><ResultHeader headline={result.headline} needs={result.team_needs} freshness={result.rosters_as_of} caveat={result.caveat} />{recommendations.length ? <div className="grid gap-3">{recommendations.map((item) => <article key={`${item.rank}-${item.target_player_id}`} className="rounded-[12px] border border-white/[.065] bg-white/[.022] p-5"><div className="flex items-start gap-3"><span className="font-mono text-sm text-[#78847e]">#{item.rank}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold text-white">Target <button type="button" onClick={() => onSelectPlayer(item.target_player_id)} className="focus-ring rounded underline decoration-white/15 underline-offset-4 transition hover:text-[#d6fb7a] hover:decoration-[#c9f958]/50">{item.target_player_name}</button> <span className="text-xs font-normal text-[#697368]">{item.position}</span></h3><span className="text-[10px] text-[#7f897b]">from {item.target_team_name}</span></div><div className="mt-2 flex flex-wrap items-center gap-1 rounded-[7px] bg-black/20 px-3 py-2 text-xs text-[#c7cec1]"><span>Offer:</span>{item.offer_player_names.map((name, index) => <span key={`${item.offer_player_ids[index]}-${name}`}><button type="button" onClick={() => item.offer_player_ids[index] && onSelectPlayer(item.offer_player_ids[index])} className="focus-ring rounded underline decoration-white/15 underline-offset-2 transition hover:text-[#d6fb7a]">{name}</button>{index < item.offer_player_names.length - 1 ? " +" : ""}</span>)}</div><div className="mt-3 grid gap-3 text-xs leading-5 text-[#929b8e] md:grid-cols-2"><p><span className="text-[#c4cbb9]">Your fit:</span> {item.why_it_helps_you}</p><p><span className="text-[#c4cbb9]">Their case:</span> {item.why_they_might_consider}</p></div><p className="mt-3 text-[11px] text-[#78847e]">Value: {item.value_balance} · Risk: {item.risk}</p></div></div></article>)}</div> : <NoResultsForPosition position={position} />}</section>;
}

function NoResultsForPosition({ position }: { position: (typeof POSITIONS)[number] }) {
  return <div className="rounded-[12px] border border-dashed border-white/[.08] px-5 py-10 text-center"><p className="text-sm font-medium text-[#c4cbb9]">No {position} recommendations in this run</p><p className="mt-1 text-xs text-[#697368]">Keep this filter selected and choose Ask again to generate them.</p></div>;
}
