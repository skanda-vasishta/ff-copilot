'use client'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AgentThread } from '@ff-copilot/agent-runtime'
import { useAgent } from '@/features/copilot/client/useAgent'
import { AgentMessage } from '@/features/copilot/components/AgentMessage'
import { getAgentModels, setAgentPreferences } from '@/features/copilot/client/api'
import type { AgentModelSelection } from '@/features/copilot/client/api'

export function DraftCopilot({ thread, season }: { thread: AgentThread | null; season: number }) {
  const [input, setInput] = useState('')
  const [modelSelection, setModelSelection] = useState<AgentModelSelection | null>(null)
  const [savingModel, setSavingModel] = useState(false)
  const [preferenceError, setPreferenceError] = useState<string | null>(null)
  const agent = useAgent(thread ? { ...thread, season } : null)
  const models = useQuery({ queryKey: ['agent-models'], queryFn: getAgentModels })
  const messagesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (models.data?.selected && !savingModel) setModelSelection(models.data.selected)
  }, [models.data?.selected, savingModel])
  useEffect(() => {
    const messages = messagesRef.current
    if (!messages) return
    messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' })
  }, [agent.messages, agent.status])
  async function chooseModel(model: string) {
    const option = models.data?.models.find((candidate) => candidate.id === model)
    if (!option) return
    const previous = modelSelection
    const currentEffort = modelSelection?.reasoningEffort
    const reasoningEffort = currentEffort && option.efforts.includes(currentEffort) ? currentEffort : option.efforts[0]
    setModelSelection({ model, reasoningEffort }); setSavingModel(true); setPreferenceError(null)
    try { const saved = await setAgentPreferences(model, reasoningEffort); setModelSelection(saved.selected); await models.refetch() }
    catch (cause) { setModelSelection(previous); setPreferenceError(cause instanceof Error ? cause.message : 'Could not save model') }
    finally { setSavingModel(false) }
  }
  async function chooseReasoning(reasoningEffort: string) {
    const model = modelSelection?.model
    if (!model) return
    const previous = modelSelection
    setModelSelection({ model, reasoningEffort }); setSavingModel(true); setPreferenceError(null)
    try { const saved = await setAgentPreferences(model, reasoningEffort); setModelSelection(saved.selected); await models.refetch() }
    catch (cause) { setModelSelection(previous); setPreferenceError(cause instanceof Error ? cause.message : 'Could not save reasoning effort') }
    finally { setSavingModel(false) }
  }
  async function submit(event: FormEvent) { event.preventDefault(); const value = input.trim(); if (!value) return; setInput(''); await agent.send(value) }
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex min-h-12 items-center gap-2 border-b border-white/[.06] px-4 py-2"><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8daa48]">Draft Copilot</p><p className="mt-0.5 truncate text-[10px] text-[#737b70]">Latest board included with every request</p></div>{models.data?.models.length&&modelSelection?<><select aria-label="Model" value={modelSelection.model} onChange={(event)=>chooseModel(event.target.value)} disabled={agent.status!=='idle'||savingModel} className="h-7 max-w-36 rounded-[5px] border-0 bg-white/[.035] px-2 text-[10px] text-[#9ca497] outline-none hover:bg-white/[.055] disabled:opacity-35">{models.data.models.map((model)=><option key={model.id} value={model.id}>{model.label}</option>)}</select><select aria-label="Reasoning effort" value={modelSelection.reasoningEffort} onChange={(event)=>chooseReasoning(event.target.value)} disabled={agent.status!=='idle'||savingModel} className="h-7 max-w-24 rounded-[5px] border-0 bg-white/[.035] px-2 text-[10px] capitalize text-[#9ca497] outline-none hover:bg-white/[.055] disabled:opacity-35">{models.data.models.find((model)=>model.id===modelSelection.model)?.efforts.map((effort)=><option key={effort} value={effort}>{effort}</option>)}</select></>:null}</div>
    <div ref={messagesRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
      {!agent.messages.length && <p className="text-xs leading-5 text-[#747c70]">Ask who to take, compare candidates, or analyze what other teams need.</p>}
      {agent.messages.map((message) => <AgentMessage key={message.id} message={message} />)}
      {agent.status !== 'idle' && agent.status !== 'error' && <p className="text-xs text-[#747c70]">{agent.status === 'running-tool' ? 'Checking player data…' : 'Thinking…'}</p>}
      {agent.error && <p className="text-xs text-red-300">{agent.error}</p>}
      {preferenceError && <p className="text-xs text-red-300">{preferenceError}</p>}
    </div>
    <form onSubmit={submit} className="border-t border-white/[.06] p-3"><div className="flex items-end gap-2 rounded-[8px] border border-white/[.08] bg-white/[.025] p-1.5"><textarea rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="Ask about this draft…" className="min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-xs text-[#e8ebe3] outline-none"/><button disabled={!input.trim() || agent.status !== 'idle'} className="grid size-8 place-items-center rounded-[6px] bg-[#c9f958] text-[#15200b] disabled:opacity-25">↑</button></div></form>
  </div>
}
