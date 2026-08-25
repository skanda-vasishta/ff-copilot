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

  return <div className="grid h-full min-h-0 overflow-hidden bg-[#0d1114] lg:grid-cols-[260px_minmax(0,1fr)]">
    <aside className="flex min-h-0 flex-col border-b border-white/[.07] bg-[#090c0f] lg:border-b-0 lg:border-r">
      <div className="border-b border-white/[.06] p-3.5">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-[.18em] text-[#65716b]">Team workspace</p>
        <div className="mt-2 border-l-2 border-[#b7f34a]/55 px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center border border-white/[.08] text-[10px] font-bold text-[#b7f34a]">{scope?.team.name?.slice(0, 2).toUpperCase() || "FF"}</span>
            <span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{scope?.team.name || "No team selected"}</span><span className="mt-0.5 block truncate text-[10px] text-[#65716b]">{scope ? `${scope.team.league.name || "League"} · ${scope.team.league.season}` : "Choose a team in settings"}</span></span>
          </div>
        </div>
        <button disabled={!scope || loadingScope} onClick={newThread} className="focus-ring mt-2.5 w-full rounded-md border border-[#b7f34a]/35 bg-[#b7f34a]/[.08] px-3 py-2 text-xs font-semibold text-[#b7f34a] hover:bg-[#b7f34a]/[.13] disabled:cursor-not-allowed disabled:opacity-35">+ New conversation</button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[.15em] text-[#58635d]">Conversations</p>
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto lg:block lg:space-y-1 lg:overflow-y-auto">
          {threads.map((item) => <button key={item.id} onClick={() => setThreadId(item.id)} className={`focus-ring min-w-52 border-l-2 px-3 py-2 text-left text-[13px] transition lg:w-full lg:min-w-0 ${item.id === threadId ? "border-[#b7f34a]/60 bg-white/[.045] text-white" : "border-transparent text-[#78847e] hover:bg-white/[.025] hover:text-white"}`}><span className="block truncate font-medium">{item.title}</span><span className="mt-0.5 block text-[9px] text-[#4f5a54]">{new Date(item.updated_at).toLocaleDateString()}</span></button>)}
          {!loadingThreads && !threads.length && <p className="px-2 py-3 text-xs leading-5 text-[#58635d]">Conversations for this team will appear here.</p>}
        </div>
      </div>
    </aside>

    <section className="flex min-h-0 min-w-0 flex-col">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/[.07] px-5 py-2.5 sm:px-6">
        <div className="min-w-0"><p className="truncate text-[10px] font-semibold uppercase tracking-[.15em] text-[#65716b]">{scope?.team.name || "Workspace"} / Copilot</p><h1 className="mt-1 truncate font-semibold text-white">{thread?.title || "New conversation"}</h1></div>
        <div className="flex items-center gap-2">
          {models.data?.models.length && modelSelection ? <>
            <select aria-label="Model" value={modelSelection.model} onChange={(event) => chooseModel(event.target.value)} disabled={agent.status !== "idle" || savingModel} className="focus-ring h-8 rounded-md border border-white/[.09] bg-[#090d10] px-2 text-[11px] text-[#aab4af] disabled:opacity-40">{models.data.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select>
            <select aria-label="Reasoning effort" value={modelSelection.reasoningEffort} onChange={(event) => chooseReasoning(event.target.value)} disabled={agent.status !== "idle" || savingModel} className="focus-ring h-8 rounded-md border border-white/[.09] bg-[#090d10] px-2 text-[11px] capitalize text-[#aab4af] disabled:opacity-40">{models.data.models.find((model) => model.id === modelSelection.model)?.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select>
          </> : null}
          {thread && <button disabled={refreshingContext || agent.status !== "idle"} onClick={refreshContext} className="focus-ring h-8 rounded-md border border-white/[.08] px-2.5 text-[11px] text-[#78847e] hover:text-white disabled:opacity-40">{refreshingContext ? "Refreshing…" : "Refresh context"}</button>}
          {thread && <button onClick={removeThread} className="focus-ring h-8 rounded-md border border-white/[.08] px-2.5 text-[11px] text-[#65716b] hover:border-red-300/20 hover:text-red-200">Delete</button>}
        </div>
      </header>
      {contextNotice && <div className="border-b border-white/[.06] px-6 py-2 text-xs text-[#8c9992]">{contextNotice}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col space-y-4">
          {!thread && !loadingThreads && <div className="m-auto max-w-lg py-16 text-center"><span className="mx-auto text-xl text-[#b7f34a]">✦</span><h2 className="mt-5 text-2xl font-semibold tracking-[-.03em] text-white">Start with your team</h2><p className="mt-3 text-sm leading-6 text-[#78847e]">Each conversation belongs to the selected team workspace and uses its league context.</p>{scope && <button onClick={newThread} className="focus-ring mt-6 rounded-md border border-[#b7f34a]/40 px-5 py-2.5 text-sm font-semibold text-[#b7f34a]">New conversation</button>}</div>}
          {thread && !agent.messages.length && <div className="m-auto max-w-xl py-16 text-center"><h2 className="text-2xl font-semibold tracking-[-.03em] text-white">What are you deciding?</h2><p className="mt-3 text-sm leading-6 text-[#78847e]">Ask about a player, compare your roster, or work through a waiver or trade decision.</p></div>}
          {agent.messages.map((message) => <AgentMessage key={message.id} message={message} />)}
          {agent.status !== "idle" && agent.status !== "error" && <div className="flex items-center gap-2 text-xs text-[#78847e]"><span className="size-2 animate-pulse rounded-full bg-[#b7f34a]" />{agent.status === "running-tool" ? "Checking the data…" : "Thinking…"}</div>}
          {agent.error && <div role="alert" className="flex items-center justify-between gap-3 border-l-2 border-red-400/40 bg-red-400/[.04] px-4 py-3 text-xs text-red-200"><span>{agent.error}</span><button onClick={agent.clearError} className="underline">Dismiss</button></div>}
          <div ref={end} />
        </div>
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-white/[.07] bg-[#0d1114]/95 p-2.5 sm:p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-md border border-white/[.11] bg-[#090d10] p-1.5 focus-within:border-[#b7f34a]/35">
          <textarea aria-label="Message" disabled={!thread || agent.status !== "idle"} rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={thread ? "Ask about players, your roster, waivers, or a trade…" : "Create a conversation first"} className="max-h-32 min-h-9 flex-1 resize-none overflow-y-auto bg-transparent px-2.5 py-1.5 text-[13px] leading-6 text-white outline-none placeholder:text-[#4f5a54] disabled:opacity-50" />
          {agent.status !== "idle" && agent.status !== "error" ? <button type="button" onClick={agent.cancel} className="focus-ring h-8 rounded-md border border-white/[.09] px-3 text-[11px] text-[#aab4af]">Stop</button> : <button disabled={!thread || !input.trim()} className="focus-ring h-8 rounded-md bg-[#b7f34a] px-3 text-xs font-semibold text-[#10140a] disabled:opacity-30">Send</button>}
        </div>
      </form>
    </section>
  </div>;
}
