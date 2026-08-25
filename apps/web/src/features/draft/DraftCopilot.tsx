'use client'
import { FormEvent, useState } from 'react'
import type { AgentThread } from '@ff-copilot/agent-runtime'
import { useAgent } from '@/features/copilot/client/useAgent'
import { AgentMessage } from '@/features/copilot/components/AgentMessage'

export function DraftCopilot({ thread, season }: { thread: AgentThread | null; season: number }) {
  const [input, setInput] = useState('')
  const agent = useAgent(thread ? { ...thread, season } : null)
  async function submit(event: FormEvent) { event.preventDefault(); const value = input.trim(); if (!value) return; setInput(''); await agent.send(value) }
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="border-b border-white/[.06] px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8daa48]">Draft Copilot</p><p className="mt-1 text-xs text-[#737b70]">Uses the complete board at the start of each request.</p></div>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
      {!agent.messages.length && <p className="text-xs leading-5 text-[#747c70]">Ask who to take, compare candidates, or analyze what other teams need.</p>}
      {agent.messages.map((message) => <AgentMessage key={message.id} message={message} />)}
      {agent.status !== 'idle' && agent.status !== 'error' && <p className="text-xs text-[#747c70]">{agent.status === 'running-tool' ? 'Checking player data…' : 'Thinking…'}</p>}
      {agent.error && <p className="text-xs text-red-300">{agent.error}</p>}
    </div>
    <form onSubmit={submit} className="border-t border-white/[.06] p-3"><div className="flex items-end gap-2 rounded-[8px] border border-white/[.08] bg-white/[.025] p-1.5"><textarea rows={1} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder="Ask about this draft…" className="min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-xs text-[#e8ebe3] outline-none"/><button disabled={!input.trim() || agent.status !== 'idle'} className="grid size-8 place-items-center rounded-[6px] bg-[#c9f958] text-[#15200b] disabled:opacity-25">↑</button></div></form>
  </div>
}
