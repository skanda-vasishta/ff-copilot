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
  const [threadQuery, setThreadQuery] = useState("");
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
  const groupedThreads = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86_400_000;
    const groups: Record<string, AgentThread[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const item of threads.filter((candidate) => candidate.title.toLowerCase().includes(threadQuery.trim().toLowerCase()))) {
      const updated = new Date(item.updated_at).getTime();
      groups[updated >= today ? "Today" : updated >= yesterday ? "Yesterday" : "Earlier"].push(item);
    }
    return Object.entries(groups).filter(([, items]) => items.length);
  }, [threads, threadQuery]);
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

  async function removeThread(id: string) {
    await deleteThread(id);
    const remaining = threads.filter((item) => item.id !== id);
    setThreads(remaining);
    if (threadId === id) setThreadId(remaining[0]?.id || null);
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

  return <div className="grid h-full min-h-0 overflow-hidden bg-[#080907] lg:grid-cols-[238px_minmax(0,1fr)]">
    <aside className="flex min-h-0 flex-col border-b border-white/[.06] bg-white/[.018] backdrop-blur-lg lg:border-b-0 lg:border-r">
      <div className="p-3.5 pb-2.5">
        <button disabled={!scope || loadingScope} onClick={newThread} className="focus-ring flex h-9 w-full items-center gap-2 rounded-[8px] border border-[#c9f958]/25 bg-[#c9f958]/10 px-3 text-[11px] font-semibold text-[#d6fb7a] hover:border-[#c9f958]/40 hover:bg-[#c9f958]/15 disabled:cursor-not-allowed disabled:opacity-35"><span className="text-base font-light">+</span> New conversation</button>
        {!scope && <p className="mt-2 px-1 text-[10px] text-amber-200/70">Select a team from settings first.</p>}
      </div>
      <label className="mx-3.5 mb-2.5 flex h-8 items-center gap-2 rounded-[7px] border border-white/[.055] bg-white/[.035] px-2.5"><span className="text-[10px] text-[#6e7568]">⌕</span><input aria-label="Search conversations" value={threadQuery} onChange={(event) => setThreadQuery(event.target.value)} placeholder="Search conversations" className="min-w-0 flex-1 bg-transparent text-[10px] text-[#eef1e9] outline-none placeholder:text-[#5f6659]" /></label>
      <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-4">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {groupedThreads.map(([label, items]) => <div key={label} className="mb-1.5"><p className="px-2 py-2 text-[9px] font-semibold uppercase tracking-[.1em] text-[#5f6659]">{label}</p>{items.map((item) => <div key={item.id} className={`group flex h-8 items-center rounded-[6px] transition ${item.id === threadId ? "bg-white/[.065] text-[#eef1e9]" : "text-[#8a9280] hover:bg-white/[.035] hover:text-[#eef1e9]"}`}><button onClick={() => setThreadId(item.id)} className="focus-ring flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-[6px] pl-2 text-left text-[11px]"><span className={`h-3 w-0.5 shrink-0 rounded-full ${item.id === threadId ? "bg-[#c9f958]" : "bg-transparent"}`} /><span className="min-w-0 flex-1 truncate">{item.title}</span><span className="font-mono text-[8px] text-[#5f6659]">{new Date(item.updated_at).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</span></button><button aria-label={`Delete ${item.title}`} title="Delete conversation" onClick={() => removeThread(item.id)} className={`focus-ring mr-1 grid size-6 shrink-0 place-items-center rounded-[5px] text-[11px] transition hover:bg-red-400/[.08] hover:text-red-200 ${item.id === threadId ? "text-[#687064]" : "text-transparent group-hover:text-[#687064] focus-visible:text-[#687064]"}`}>×</button></div>)}</div>)}
          {!loadingThreads && !groupedThreads.length && <p className="px-2 py-3 text-xs leading-5 text-[#58635d]">{threadQuery ? "No matching conversations." : "Conversations for this team will appear here."}</p>}
        </div>
      </div>
    </aside>

    <section className="flex min-h-0 min-w-0 flex-col">
      <header className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-white/[.055] bg-[#0a0b09]/60 px-5 py-2 backdrop-blur-xl sm:px-6">
        <div className="min-w-0"><h1 className="truncate text-sm font-semibold text-[#eef1e9]">{thread?.title || "New conversation"}</h1><p className="mt-0.5 truncate font-mono text-[10px] text-[#6e7568]">{scope ? `${scope.team.name} · ${scope.team.league.name || "League"} ${scope.team.league.season}` : "Select a team"}</p></div>
        <div className="flex items-center gap-2">
          {models.data?.models.length && modelSelection ? <>
            <select aria-label="Model" value={modelSelection.model} onChange={(event) => chooseModel(event.target.value)} disabled={agent.status !== "idle" || savingModel} className="focus-ring h-8 rounded-md border border-white/[.09] bg-[#090d10] px-2 text-[11px] text-[#aab4af] disabled:opacity-40">{models.data.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select>
            <select aria-label="Reasoning effort" value={modelSelection.reasoningEffort} onChange={(event) => chooseReasoning(event.target.value)} disabled={agent.status !== "idle" || savingModel} className="focus-ring h-8 rounded-md border border-white/[.09] bg-[#090d10] px-2 text-[11px] capitalize text-[#aab4af] disabled:opacity-40">{models.data.models.find((model) => model.id === modelSelection.model)?.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select>
          </> : null}
          {thread && <button disabled={refreshingContext || agent.status !== "idle"} onClick={refreshContext} className="focus-ring h-8 rounded-md border border-white/[.08] px-2.5 text-[11px] text-[#78847e] hover:text-white disabled:opacity-40">{refreshingContext ? "Refreshing…" : "Refresh context"}</button>}
        </div>
      </header>
      {contextNotice && <div className="border-b border-white/[.06] px-6 py-2 text-xs text-[#8c9992]">{contextNotice}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-8 sm:px-8">
        <div className="mx-auto flex min-h-full max-w-[820px] flex-col space-y-7">
          {!thread && !loadingThreads && <div className="m-auto max-w-lg py-16 text-center"><span className="mx-auto text-xl text-[#b7f34a]">✦</span><h2 className="mt-5 text-2xl font-semibold tracking-[-.03em] text-white">Start with your team</h2><p className="mt-3 text-sm leading-6 text-[#78847e]">Each conversation belongs to the selected team workspace and uses its league context.</p>{scope && <button onClick={newThread} className="focus-ring mt-6 rounded-md border border-[#b7f34a]/40 px-5 py-2.5 text-sm font-semibold text-[#b7f34a]">New conversation</button>}</div>}
          {thread && !agent.messages.length && <div className="m-auto max-w-xl py-16 text-center"><h2 className="text-2xl font-semibold tracking-[-.03em] text-white">What are you deciding?</h2><p className="mt-3 text-sm leading-6 text-[#78847e]">Ask about a player, compare your roster, or work through a waiver or trade decision.</p></div>}
          {agent.messages.map((message) => <AgentMessage key={message.id} message={message} />)}
          {agent.status !== "idle" && agent.status !== "error" && <div className="flex items-center gap-2 text-xs text-[#78847e]"><span className="size-2 animate-pulse rounded-full bg-[#b7f34a]" />{agent.status === "running-tool" ? "Checking the data…" : "Thinking…"}</div>}
          {agent.error && <div role="alert" className="flex items-center justify-between gap-3 border-l-2 border-red-400/40 bg-red-400/[.04] px-4 py-3 text-xs text-red-200"><span>{agent.error}</span><button onClick={agent.clearError} className="underline">Dismiss</button></div>}
          <div ref={end} />
        </div>
      </div>

      <form onSubmit={submit} className="shrink-0 bg-gradient-to-t from-[#080907] via-[#080907]/95 to-transparent px-5 pb-5 pt-2 sm:px-8">
        <div className="mx-auto flex max-w-[820px] items-end gap-2 rounded-[18px] border border-white/[.09] bg-[#181a16]/80 p-2 shadow-[0_20px_44px_-24px_rgba(0,0,0,.8)] backdrop-blur-xl focus-within:border-[#c9f958]/30">
          <textarea aria-label="Message" disabled={!thread || agent.status !== "idle"} rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={thread ? "Ask about players, your roster, waivers, or a trade…" : "Create a conversation first"} className="max-h-36 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-2.5 py-2 text-sm leading-6 text-[#eef1e9] outline-none placeholder:text-[#5f6659] disabled:opacity-50" />
          {agent.status !== "idle" && agent.status !== "error" ? <button type="button" onClick={agent.cancel} className="focus-ring grid size-9 place-items-center rounded-[10px] border border-white/[.09] text-[11px] text-[#a8b09c]">Stop</button> : <button aria-label="Send message" disabled={!thread || !input.trim()} className="focus-ring grid size-9 place-items-center rounded-[10px] bg-gradient-to-br from-[#d9ff6e] to-[#a8e63c] text-lg font-semibold text-[#12200a] disabled:opacity-25">↑</button>}
        </div>
      </form>
    </section>
  </div>;
}
