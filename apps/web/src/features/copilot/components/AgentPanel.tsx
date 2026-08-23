"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAgent } from "@/features/copilot/client/useAgent";
import { createThread, deleteThread, listThreads, updateThread } from "@/features/copilot/client/threads";
import type { AgentThread } from "@ff-copilot/agent-runtime";
import { AgentMessage } from "./AgentMessage";
import { useActiveScope } from "@/lib/scope";
import { getAgentModels, refreshThreadContext, setAgentPreferences } from "@/features/copilot/client/api";
import type { AgentModelSelection } from "@/features/copilot/client/api";

export function AgentPanel() {
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [refreshingContext, setRefreshingContext] = useState(false);
  const [contextNotice, setContextNotice] = useState<string | null>(null);
  const [modelSelection, setModelSelection] = useState<AgentModelSelection | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const { scope, isLoading: loadingScope } = useActiveScope();
  const models = useQuery({ queryKey: ["agent-models"], queryFn: getAgentModels });
  const thread = useMemo(() => {
    const found = threads.find((item) => item.id === threadId);
    return found ? { ...found, season: scope?.team.league.season } : null;
  }, [threadId, threads, scope?.team.league.season]);
  const agent = useAgent(thread);

  useEffect(() => {
    if (loadingScope) return;
    if (!scope) { setThreads([]); setThreadId(null); setLoadingThreads(false); return; }
    setLoadingThreads(true);
    listThreads(scope.team.id).then((rows) => {
      setThreads(rows);
      setThreadId(rows[0]?.id || null);
    }).finally(() => setLoadingThreads(false));
  }, [loadingScope, scope?.team.id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [agent.messages, agent.status]);
  useEffect(() => {
    if (models.data?.selected && !savingModel) setModelSelection(models.data.selected);
  }, [models.data?.selected, savingModel]);

  async function newThread() {
    if (!scope) return;
    const created = await createThread({ teamId: scope.team.id, leagueId: scope.team.league_id });
    setThreads((current) => [created, ...current]);
    setThreadId(created.id);
  }

  async function removeThread() {
    if (!thread) return;
    await deleteThread(thread.id);
    const remaining = threads.filter((item) => item.id !== thread.id);
    setThreads(remaining);
    setThreadId(remaining[0]?.id || null);
  }

  async function refreshContext() {
    if (!thread) return;
    setRefreshingContext(true); setContextNotice(null);
    try {
      const result = await refreshThreadContext(thread.id);
      setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, context_date_utc: result.context.context_date_utc, context_refreshed_at: result.context.refreshed_at } : item));
      setContextNotice("League context refreshed");
    } catch (cause) {
      setContextNotice(cause instanceof Error ? cause.message : "Could not refresh context");
    } finally { setRefreshingContext(false); }
  }

  async function chooseModel(model: string) {
    const option = models.data?.models.find((candidate) => candidate.id === model);
    if (!option) return;
    const previous = modelSelection;
    const currentEffort = modelSelection?.reasoningEffort;
    const effort = currentEffort && option.efforts.includes(currentEffort) ? currentEffort : option.efforts[0];
    const next = { model, reasoningEffort: effort };
    setModelSelection(next);
    setSavingModel(true);
    setContextNotice(null);
    try {
      const saved = await setAgentPreferences(model, effort);
      setModelSelection(saved.selected);
      await models.refetch();
    } catch (cause) {
      setModelSelection(previous);
      setContextNotice(cause instanceof Error ? cause.message : "Could not save model preference");
    } finally {
      setSavingModel(false);
    }
  }

  async function chooseReasoning(reasoningEffort: string) {
    const previous = modelSelection;
    const model = modelSelection?.model;
    if (!model) return;
    const next = { model, reasoningEffort };
    setModelSelection(next);
    setSavingModel(true);
    setContextNotice(null);
    try {
      const saved = await setAgentPreferences(model, reasoningEffort);
      setModelSelection(saved.selected);
      await models.refetch();
    } catch (cause) {
      setModelSelection(previous);
      setContextNotice(cause instanceof Error ? cause.message : "Could not save reasoning preference");
    } finally {
      setSavingModel(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = input;
    if (!value.trim()) return;
    setInput("");
    if (thread && thread.title === "New conversation") {
      const title = value.trim().slice(0, 60);
      updateThread(thread.id, { title }).then((updated) => setThreads((current) => current.map((item) => item.id === updated.id ? updated : item)));
    }
    await agent.send(value);
  }

  return <div className="grid min-h-[calc(100vh-9rem)] overflow-hidden rounded-3xl border border-white/[.07] bg-[#0d1114] lg:grid-cols-[270px_minmax(0,1fr)]">
    <aside className="border-b border-white/[.07] bg-[#090c0f] p-4 lg:border-b-0 lg:border-r">
      <button disabled={!scope || loadingScope} onClick={newThread} className="focus-ring w-full rounded-xl bg-[#b7f34a] px-4 py-3 text-sm font-bold text-[#10140a] hover:bg-[#c7ff5e] disabled:cursor-not-allowed disabled:opacity-35">+ New conversation</button>
      {scope ? <p className="mt-2 px-2 text-[10px] leading-4 text-[#65716b]">New threads use {scope.team.name} · {scope.team.league.season} and stay locked to it.</p> : <p className="mt-2 px-2 text-[10px] leading-4 text-amber-200/70">Select a team in settings before starting a thread.</p>}
      <p className="mb-2 mt-6 px-2 text-[10px] font-semibold uppercase tracking-[.15em] text-[#58635d]">History</p>
      <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-1">
        {threads.map((item) => <button key={item.id} onClick={() => setThreadId(item.id)} className={`focus-ring min-w-52 rounded-xl px-3 py-3 text-left text-sm transition lg:w-full ${item.id === threadId ? "bg-white/[.075] text-white" : "text-[#78847e] hover:bg-white/[.035] hover:text-white"}`}><span className="block truncate">{item.title}</span><span className="mt-1 block text-[10px] text-[#4f5a54]">{new Date(item.updated_at).toLocaleDateString()}</span></button>)}
        {!loadingThreads && !threads.length && <p className="px-2 py-3 text-xs leading-5 text-[#58635d]">Start a conversation to get personalized fantasy help.</p>}
      </div>
    </aside>

    <section className="flex min-h-[680px] min-w-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] px-5 py-4 sm:px-6">
        <div><h1 className="font-semibold text-white">In-season Copilot</h1><p className="mt-1 text-xs text-[#65716b]">Grounded in your stored player and league data</p></div>
        <div className="flex items-center gap-2">
          {models.data?.models.length && modelSelection ? <>
            <select aria-label="Model" value={modelSelection.model} onChange={(event) => chooseModel(event.target.value)} disabled={agent.status !== "idle" || savingModel} className="focus-ring rounded-lg border border-white/[.09] bg-[#090d10] px-3 py-2 text-xs text-[#aab4af] disabled:opacity-40">{models.data.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select>
            <select aria-label="Reasoning effort" value={modelSelection.reasoningEffort} onChange={(event) => chooseReasoning(event.target.value)} disabled={agent.status !== "idle" || savingModel} className="focus-ring rounded-lg border border-white/[.09] bg-[#090d10] px-3 py-2 text-xs capitalize text-[#aab4af] disabled:opacity-40">{models.data.models.find((model) => model.id === modelSelection.model)?.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select>
          </> : null}
          {thread && <button disabled={refreshingContext || agent.status !== "idle"} onClick={refreshContext} className="focus-ring rounded-lg border border-white/[.08] px-3 py-2 text-xs text-[#78847e] hover:text-white disabled:opacity-40">{refreshingContext ? "Refreshing…" : "Refresh context"}</button>}
          {thread && <button onClick={removeThread} className="focus-ring rounded-lg border border-white/[.08] px-3 py-2 text-xs text-[#65716b] hover:border-red-300/20 hover:text-red-200">Delete</button>}
        </div>
      </header>
      {contextNotice && <div className="border-b border-white/[.06] px-6 py-2 text-xs text-[#8c9992]">{contextNotice}</div>}

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-6 sm:px-8">
        {!thread && !loadingThreads && <div className="mx-auto max-w-lg py-24 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#b7f34a]/[.08] text-2xl text-[#b7f34a]">✦</span><h2 className="mt-5 text-2xl font-semibold tracking-[-.03em] text-white">Ask about your season</h2><p className="mt-3 text-sm leading-6 text-[#78847e]">New conversations automatically use the team selected in workspace settings and stay permanently scoped to it.</p>{scope && <button onClick={newThread} className="focus-ring mt-6 rounded-xl bg-[#b7f34a] px-5 py-3 text-sm font-bold text-[#10140a]">Start conversation</button>}</div>}
        {thread && !agent.messages.length && <div className="mx-auto max-w-xl py-20 text-center"><h2 className="text-2xl font-semibold tracking-[-.03em] text-white">What are you deciding?</h2><p className="mt-3 text-sm leading-6 text-[#78847e]">Try “Compare my running backs using the latest injury and ranking data” or ask about a specific player.</p></div>}
        {agent.messages.map((message) => <AgentMessage key={message.id} message={message} />)}
        {agent.status !== "idle" && agent.status !== "error" && <div className="flex items-center gap-2 text-xs text-[#78847e]"><span className="size-2 animate-pulse rounded-full bg-[#b7f34a]" />{agent.status === "running-tool" ? "Checking the data…" : "Thinking…"}</div>}
        {agent.error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-xs text-red-200"><span>{agent.error}</span><button onClick={agent.clearError} className="underline">Dismiss</button></div>}
        <div ref={end} />
      </div>

      <form onSubmit={submit} className="border-t border-white/[.07] p-4 sm:p-5">
        <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-2xl border border-white/[.1] bg-[#090d10] p-2 focus-within:border-[#b7f34a]/35">
          <textarea aria-label="Message" disabled={!thread || agent.status !== "idle"} rows={2} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={thread ? "Ask about players, your roster, waivers, or a trade…" : "Create a conversation first"} className="min-h-12 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-[#4f5a54] disabled:opacity-50" />
          {agent.status !== "idle" && agent.status !== "error" ? <button type="button" onClick={agent.cancel} className="focus-ring rounded-xl border border-white/[.09] px-4 py-3 text-xs text-[#aab4af]">Stop</button> : <button disabled={!thread || !input.trim()} className="focus-ring rounded-xl bg-[#b7f34a] px-4 py-3 text-sm font-bold text-[#10140a] disabled:opacity-30">Send</button>}
        </div>
      </form>
    </section>
  </div>;
}
