"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAgent } from "@/features/copilot/client/useAgent";
import { createThread, deleteThread, listThreads, updateThread } from "@/features/copilot/client/threads";
import type { AgentThread } from "@ff-copilot/agent-runtime";
import { AgentMessage } from "./AgentMessage";
import { useActiveScope } from "@/lib/scope";
import { getAgentModels, refreshThreadContext, setAgentPreferences } from "@/features/copilot/client/api";
import type { AgentModelSelection } from "@/features/copilot/client/api";

export function AgentPanel() {
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threadQuery, setThreadQuery] = useState("");
  const [input, setInput] = useState("");
  const [mobileScreen, setMobileScreen] = useState<"list" | "chat">("list");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [refreshingContext, setRefreshingContext] = useState(false);
  const [contextNotice, setContextNotice] = useState<string | null>(null);
  const [modelSelection, setModelSelection] = useState<AgentModelSelection | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const appliedPrompt = useRef(false);
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
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    if (prompt && !appliedPrompt.current) {
      appliedPrompt.current = true;
      setInput(prompt.slice(0, 1000));
      setMobileScreen("chat");
    }
  }, [searchParams]);

  async function newThread() {
    if (!scope) return;
    const created = await createThread({ teamId: scope.team.id, leagueId: scope.team.league_id });
    setThreads((current) => [created, ...current]);
    setThreadId(created.id);
    setMobileScreen("chat");
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

  function openThread(id: string) {
    setThreadId(id);
    setMobileScreen("chat");
  }

  return <div className="copilot-shell flex h-full min-h-0 flex-col overflow-hidden lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
    <section className={`${mobileScreen === "list" ? "flex" : "hidden"} min-h-0 flex-1 flex-col bg-black px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:hidden`}>
      <header className="flex shrink-0 items-center justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold text-white">Copilot</h1>
          <p className="mt-0.5 truncate text-xs text-[#8d8d92]">{scope ? `${scope.team.name} · ${scope.team.league.name || "League"}` : "ff-copilot"}</p>
        </div>
        <button aria-label="New chat" disabled={!scope || loadingScope} onClick={newThread} className="focus-ring grid size-11 place-items-center rounded-full text-3xl font-light text-white disabled:text-white/25">+</button>
      </header>

      <label className="mt-5 flex h-12 shrink-0 items-center gap-2 rounded-[14px] bg-[#1c1c1f] px-4">
        <span className="text-lg text-[#8d8d92]">⌕</span>
        <input aria-label="Search chats" value={threadQuery} onChange={(event) => setThreadQuery(event.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-[17px] text-white outline-none placeholder:text-[#8d8d92]" />
      </label>

      <div className="mt-8 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <h2 className="text-[22px] font-semibold tracking-[-.02em] text-white">Chats</h2>
        {scope ? <div className="mt-4 space-y-1">
          {loadingThreads && <p className="py-6 text-sm text-[#8d8d92]">Loading chats...</p>}
          {!loadingThreads && groupedThreads.map(([label, items]) => <div key={label} className="py-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[.12em] text-[#666]">{label}</p>
            {items.map((item) => <button key={item.id} onClick={() => openThread(item.id)} className="focus-ring flex min-h-16 w-full items-center gap-4 rounded-[14px] px-1 py-3 text-left">
              <span className="grid size-8 shrink-0 place-items-center rounded-[8px] border border-white/15 text-lg text-white/90">⌁</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[18px] font-medium tracking-[-.02em] text-white">{item.title}</span>
                <span className="mt-1 block truncate text-xs text-[#777]">{new Date(item.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </span>
            </button>)}
          </div>)}
          {!loadingThreads && !groupedThreads.length && <p className="py-8 text-[16px] leading-7 text-[#8d8d92]">{threadQuery ? "No matching chats." : "No chats yet. Start one when your team is connected."}</p>}
        </div> : <div className="mt-8 text-center">
          <p className="text-[16px] leading-7 text-[#9b9b9b]">Connect a league first, then your past chats and new conversations will show here.</p>
          <Link href="/settings" className="focus-ring mt-6 inline-flex rounded-full bg-white px-7 py-3 text-sm font-semibold text-black">Open settings</Link>
        </div>}
      </div>

      <button disabled={!scope || loadingScope} onClick={newThread} className="focus-ring mt-5 flex h-[58px] shrink-0 items-center justify-center gap-3 rounded-full bg-white text-[18px] font-semibold text-black shadow-[0_18px_60px_rgba(255,255,255,.16)] disabled:opacity-35"><span className="text-3xl font-light">+</span> New chat</button>
    </section>

    <aside className="copilot-sidebar hidden min-h-0 flex-col border-b lg:flex lg:border-b-0 lg:border-r">
      <div className="px-4 pb-3 pt-4">
        <button disabled={!scope || loadingScope} onClick={newThread} className="copilot-primary focus-ring flex h-8 w-full items-center justify-center gap-2 rounded-[6px] px-3 text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-35"><span className="text-base font-light">+</span> New chat</button>
        {!scope && <p className="mt-2 px-1 text-[10px] text-amber-200/70">Select a team from settings first.</p>}
      </div>
      <label className="copilot-control mx-4 mb-2 hidden h-9 items-center gap-2 rounded-[6px] border px-3 lg:flex"><span className="copilot-subtle text-[13px]">⌕</span><input aria-label="Search conversations" value={threadQuery} onChange={(event) => setThreadQuery(event.target.value)} placeholder="Search" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[var(--subtle)]" /></label>
      <div className="flex min-h-0 flex-1 flex-col pb-4">
        <div className="flex min-h-0 flex-1 gap-1.5 overflow-x-auto overflow-y-hidden lg:block lg:overflow-y-auto">
          {groupedThreads.map(([label, items]) => <div key={label} className="contents lg:mb-1.5 lg:block"><p className="copilot-subtle hidden px-[18px] pb-1.5 pt-3.5 text-[11px] font-semibold uppercase tracking-[.08em] lg:block">{label}</p>{items.map((item) => <div key={item.id} data-active={item.id === threadId} className="copilot-thread-row group flex min-h-9 w-36 shrink-0 items-center transition sm:w-44 lg:w-auto"><button onClick={() => setThreadId(item.id)} className="focus-ring flex min-w-0 flex-1 items-center gap-3 self-stretch px-[18px] text-left text-[13px]"><span className="min-w-0 flex-1 truncate">{item.title}</span><span className="copilot-subtle hidden font-mono text-[10px] sm:inline">{new Date(item.updated_at).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</span></button><button aria-label={`Delete ${item.title}`} title="Delete conversation" onClick={() => removeThread(item.id)} className="focus-ring mr-2 hidden size-6 shrink-0 place-items-center rounded-[5px] text-[11px] text-transparent transition hover:bg-red-400/[.08] hover:text-red-300 group-hover:text-[var(--subtle)] focus-visible:text-[var(--subtle)] sm:grid">×</button></div>)}</div>)}
          {!loadingThreads && !groupedThreads.length && <p className="px-2 py-3 text-xs leading-5 text-[#636363]">{threadQuery ? "No matching conversations." : "Conversations for this team will appear here."}</p>}
        </div>
      </div>
    </aside>

    <section className={`${mobileScreen === "chat" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col sm:flex`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[.055] bg-black px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] sm:hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button aria-label="Back to chats" onClick={() => setMobileScreen("list")} className="focus-ring -ml-2 grid size-9 shrink-0 place-items-center rounded-full text-3xl font-light text-white">‹</button>
            <span className="size-2 rounded-full bg-[#25d678]" />
            <h1 className="truncate text-[17px] font-semibold leading-6 text-white">{thread?.title || "Copilot"}</h1>
          </div>
          <p className="truncate text-xs text-[#8d8d92]">{scope ? `${scope.team.name} · ${scope.team.league.name || "League"}` : "ff-copilot"}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button aria-label="New conversation" disabled={!scope || loadingScope} onClick={newThread} className="focus-ring grid size-10 place-items-center rounded-full text-2xl font-light text-white disabled:text-white/25">+</button>
          {thread && <button aria-label="Refresh context" disabled={refreshingContext || agent.status !== "idle"} onClick={refreshContext} className="focus-ring grid size-10 place-items-center rounded-full text-xl text-white disabled:text-white/25">{refreshingContext ? "..." : "↻"}</button>}
        </div>
      </header>

      <div className="hidden shrink-0 border-b border-white/[.055] bg-black px-4 py-2 sm:hidden">
        {threads.length ? <select aria-label="Conversation" value={threadId || ""} onChange={(event) => setThreadId(event.target.value || null)} className="focus-ring h-10 w-full rounded-full border-0 bg-[#1c1c1f] px-4 text-sm text-white outline-none">
          {threads.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select> : null}
      </div>

      <header className="copilot-toolbar hidden min-h-[52px] flex-wrap items-center justify-between gap-2 border-b px-4 py-2 sm:flex sm:px-6">
        <div className="min-w-0"><h1 className="copilot-title truncate text-sm font-semibold">{thread?.title || "New conversation"}</h1><p className="copilot-subtle mt-0.5 truncate font-mono text-[10px]">{scope ? `${scope.team.name} · ${scope.team.league.name || "League"} ${scope.team.league.season}` : "Select a team"}</p></div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:flex-none">
          {models.data?.models.length && modelSelection ? <>
            <select aria-label="Model" value={modelSelection.model} onChange={(event) => chooseModel(event.target.value)} disabled={agent.status !== "idle" || savingModel} className="copilot-control focus-ring h-8 min-w-0 max-w-24 rounded-[6px] border px-2 text-[11px] outline-none transition disabled:opacity-35 sm:max-w-none">{models.data.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select>
            <select aria-label="Reasoning effort" value={modelSelection.reasoningEffort} onChange={(event) => chooseReasoning(event.target.value)} disabled={agent.status !== "idle" || savingModel} className="copilot-control focus-ring hidden h-8 rounded-[6px] border px-2 text-[11px] capitalize outline-none transition disabled:opacity-35 min-[390px]:block">{models.data.models.find((model) => model.id === modelSelection.model)?.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select>
          </> : null}
          {thread && <button aria-label="Refresh context" disabled={refreshingContext || agent.status !== "idle"} onClick={refreshContext} className="copilot-control focus-ring h-8 rounded-[6px] border px-2 text-[11px] transition disabled:opacity-35">{refreshingContext ? "..." : "↻"}<span className="hidden sm:inline"> Refresh</span></button>}
        </div>
        <div className="flex w-full items-center gap-2 lg:hidden">
          {threads.length ? <select aria-label="Conversation" value={threadId || ""} onChange={(event) => setThreadId(event.target.value || null)} className="focus-ring h-9 min-w-0 flex-1 rounded-[7px] border border-white/[.06] bg-white/[.035] px-2.5 text-xs text-[#d2d2d2] outline-none">
            {threads.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select> : <span className="min-w-0 flex-1 truncate text-[11px] text-[#767676]">{scope ? "No conversations yet" : "Connect a team to start"}</span>}
          <button disabled={!scope || loadingScope} onClick={newThread} className="focus-ring h-9 shrink-0 rounded-[7px] border border-[#c94f49]/25 bg-[#c94f49]/10 px-3 text-[11px] font-semibold text-[#f0aaa5] disabled:opacity-35">New</button>
        </div>
      </header>
      {contextNotice && <div className="border-b border-white/[.06] px-6 py-2 text-xs text-[#999999]">{contextNotice}</div>}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8 sm:py-[34px]">
        <div className="mx-auto flex min-h-full max-w-[760px] flex-col space-y-6 sm:space-y-[34px]">
          {!thread && (!loadingThreads || !scope) && <div className="m-auto max-w-lg py-16 text-center"><span className="copilot-brand mx-auto text-xl">»</span><h2 className="copilot-empty-title mt-5 text-[26px] font-semibold tracking-[-.03em] sm:text-2xl">Start with your team</h2><p className="copilot-muted mt-3 text-base leading-7 sm:text-sm sm:leading-6">Connect a league, then ask Copilot about lineups, waivers, trades, and matchups.</p>{scope ? <button onClick={newThread} className="copilot-primary focus-ring mt-7 rounded-[6px] px-5 py-2.5 text-sm font-semibold">New conversation</button> : <Link href="/settings" className="copilot-primary focus-ring mt-7 inline-flex rounded-[6px] px-5 py-2.5 text-sm font-semibold">Open settings</Link>}</div>}
          {thread && !agent.messages.length && <div className="m-auto max-w-xl py-16 text-center"><h2 className="copilot-empty-title text-[26px] font-semibold tracking-[-.03em] sm:text-2xl">What are you deciding?</h2><p className="copilot-muted mt-3 text-base leading-7 sm:text-sm sm:leading-6">Ask about a player, compare your roster, or work through a waiver or trade decision.</p></div>}
          {agent.messages.map((message) => <AgentMessage key={message.id} message={message} />)}
          {agent.status !== "idle" && agent.status !== "error" && <div className="copilot-muted flex items-center gap-2 text-xs"><span className="size-2 animate-pulse rounded-full bg-[var(--brand)]" />{agent.status === "running-tool" ? "Checking the data…" : "Thinking…"}</div>}
          {agent.error && <div role="alert" className="flex items-center justify-between gap-3 border-l-2 border-red-400/40 bg-red-400/[.04] px-4 py-3 text-xs text-red-200"><span>{agent.error}</span><button onClick={agent.clearError} className="underline">Dismiss</button></div>}
          <div ref={end} />
        </div>
      </div>

      <form onSubmit={submit} className="copilot-composer-fade shrink-0 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-8 sm:pb-[22px]">
        <div className="copilot-composer mx-auto flex max-w-[760px] items-end gap-2 rounded-[10px] border p-2 transition sm:p-2.5">
          <button type="button" aria-label="Add context" className="mb-1 grid size-9 shrink-0 place-items-center rounded-full text-3xl font-light leading-none text-white/90 sm:hidden">+</button>
          <textarea aria-label="Message" disabled={!thread || agent.status !== "idle"} rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={thread ? "Ask about players, your roster, waivers, or a trade" : "Create a conversation first"} className="max-h-36 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-2 text-base leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--subtle)] disabled:opacity-50 sm:px-2.5 sm:text-[15px]" />
          {agent.status !== "idle" && agent.status !== "error" ? <button type="button" onClick={agent.cancel} className="copilot-control focus-ring mb-1 h-8 shrink-0 rounded-[6px] border px-2.5 text-[11px] font-medium transition hover:text-red-300">Stop</button> : <button aria-label="Send message" disabled={!thread || !input.trim()} className="copilot-send focus-ring mb-1 grid size-8 shrink-0 place-items-center rounded-[6px] text-base font-semibold transition">↑</button>}
        </div>
      </form>
    </section>
  </div>;
}
