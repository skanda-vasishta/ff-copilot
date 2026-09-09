'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { PlayerDetailModal } from '@/components/features/players/PlayerDetailModal'
import { api, queryString } from '@/lib/api'
import { useActiveScope } from '@/lib/scope'

type Team = { id: string; name: string }
type Player = { id: string; name: string; position: string | null; nfl_team: string | null }
type TransactionItem = {
  id: string
  item_type: string
  player_external_id: string | null
  player_name: string | null
  player: Player | null
  from_team: Team | null
  to_team: Team | null
}
type Transaction = {
  id: string
  provider_transaction_id: string
  transaction_type: string
  status: string
  proposed_at: string | null
  processed_at: string | null
  expires_at: string | null
  bid_amount: number | null
  initiated_by_team: Team | null
  items: TransactionItem[]
}
type Page<T> = { items: T[]; page: number; page_size: number; total: number; total_pages: number }
type TransactionResponse = { incoming: Transaction[]; outgoing: Transaction[]; league: Page<Transaction> }

export default function TransactionsPage() {
  const { scope, isLoading } = useActiveScope()
  const [page, setPage] = useState(1)
  const [timeRange, setTimeRange] = useState('all')
  const [teamFilter, setTeamFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const leagueId = scope?.team.league_id
  const teams = useQuery({
    queryKey: ['league-teams', leagueId],
    queryFn: () => api<Team[]>(`/v1/leagues/${leagueId}/teams`),
    enabled: Boolean(leagueId),
  })
  const transactions = useQuery({
    queryKey: ['league-transactions', leagueId, scope?.team.id, page, timeRange, teamFilter, typeFilter],
    queryFn: () => api<TransactionResponse>(`/v1/leagues/${leagueId}/transactions?${queryString({
      team_id: scope!.team.id, page, page_size: 20, time_range: timeRange,
      transaction_type: typeFilter, filter_team_id: teamFilter || undefined,
    })}`),
    enabled: Boolean(scope),
  })

  const changeFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1) }
  if (isLoading) return <main className="mx-auto max-w-[1120px] p-8 text-sm text-[#8a9280]">Loading your workspace…</main>
  if (!scope) return <main className="mx-auto max-w-xl px-5 py-24 text-center"><h1 className="text-2xl font-semibold text-white">Add a team first</h1><p className="mt-3 text-sm text-[#78847e]">Connect an ESPN league to see trades and transactions.</p><Link href="/settings" className="mt-5 inline-flex h-9 items-center rounded-[6px] bg-[#c9f958] px-4 text-xs font-semibold text-[#11170a]">Open settings</Link></main>

  const feed = transactions.data?.league
  return <main className="mx-auto max-w-[1120px] px-4 py-7 sm:px-6 lg:px-8">
    <header><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#9dbe4e]">{scope.team.league.name || 'ESPN league'} · {scope.team.league.season}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] text-[#eef1e9]">Trades & transactions</h1><p className="mt-2 text-sm text-[#78847e]">Offers involving {scope.team.name}, plus completed moves across the league.</p></header>
    {transactions.isError && <div className="mt-6 rounded-[10px] border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">{transactions.error.message}</div>}
    <div className="mt-7 grid gap-5 lg:grid-cols-2">
      <TransactionSection title="Proposed to you" eyebrow="Incoming trades" empty="No outstanding offers from other teams." transactions={transactions.data?.incoming || []} onSelectPlayer={setSelectedPlayerId} highlight />
      <TransactionSection title="Proposed by you" eyebrow="Outgoing trades" empty="You have no outstanding offers." transactions={transactions.data?.outgoing || []} onSelectPlayer={setSelectedPlayerId} />
    </div>
    <section className="mt-5 overflow-hidden rounded-[14px] border border-white/[.06] bg-white/[.022]">
      <div className="border-b border-white/[.06] px-5 py-4">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">Completed transactions</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">League activity</h2></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <FilterSelect label="Time" value={timeRange} onChange={changeFilter(setTimeRange)} options={[['all', 'All time'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']]} />
            <FilterSelect label="Team" value={teamFilter} onChange={changeFilter(setTeamFilter)} options={[['', 'All teams'], ...(teams.data || []).map((team): [string, string] => [team.id, team.name])]} />
            <FilterSelect label="Type" value={typeFilter} onChange={changeFilter(setTypeFilter)} options={[['all', 'All types'], ['trade', 'Trades'], ['waiver', 'Waivers'], ['free_agent', 'Free agents']]} />
          </div>
        </div>
      </div>
      {transactions.isFetching && !feed ? <p className="px-5 py-10 text-center text-sm text-[#747c70]">Loading activity…</p> : feed?.items.length ? <div className="divide-y divide-white/[.055]">{feed.items.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onSelectPlayer={setSelectedPlayerId} />)}</div> : <p className="px-5 py-10 text-center text-sm text-[#747c70]">No transactions match these filters.</p>}
      {feed && feed.total > 0 && <div className="flex items-center justify-between border-t border-white/[.06] px-5 py-3">
        <p className="text-[11px] text-[#737b70]">{(feed.page - 1) * feed.page_size + 1}–{Math.min(feed.page * feed.page_size, feed.total)} of {feed.total}</p>
        <div className="flex items-center gap-2"><button disabled={page <= 1 || transactions.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-[6px] border border-white/[.08] px-3 py-1.5 text-xs text-[#b8beb3] hover:bg-white/[.04] disabled:opacity-30">Previous</button><span className="min-w-20 text-center text-[11px] text-[#7f877b]">Page {feed.page} of {feed.total_pages}</span><button disabled={page >= feed.total_pages || transactions.isFetching} onClick={() => setPage((value) => value + 1)} className="rounded-[6px] border border-white/[.08] px-3 py-1.5 text-xs text-[#b8beb3] hover:bg-white/[.04] disabled:opacity-30">Next</button></div>
      </div>}
    </section>
    {selectedPlayerId && <PlayerDetailModal playerId={selectedPlayerId} onClose={() => setSelectedPlayerId(null)} />}
  </main>
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label className="flex min-w-36 flex-col gap-1"><span className="text-[9px] font-semibold uppercase tracking-[.08em] text-[#626a5f]">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 rounded-[6px] border border-white/[.08] bg-[#10130f] px-2 text-xs text-[#cbd0c7] outline-none focus:border-[#c9f958]/40">{options.map(([optionValue, name]) => <option key={optionValue} value={optionValue}>{name}</option>)}</select></label>
}

function TransactionSection({ title, eyebrow, empty, transactions, onSelectPlayer, highlight = false }: { title: string; eyebrow: string; empty: string; transactions: Transaction[]; onSelectPlayer: (id: string) => void; highlight?: boolean }) {
  return <section className={`overflow-hidden rounded-[14px] border ${highlight ? 'border-[#c9f958]/20 bg-[#c9f958]/[.025]' : 'border-white/[.06] bg-white/[.022]'}`}>
    <div className="border-b border-white/[.06] px-5 py-4"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">{title}</h2></div>
    {transactions.length ? <div className="divide-y divide-white/[.055]">{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onSelectPlayer={onSelectPlayer} />)}</div> : <p className="px-5 py-10 text-center text-sm text-[#747c70]">{empty}</p>}
  </section>
}

function PlayerButton({ item, onSelect }: { item: TransactionItem; onSelect: (id: string) => void }) {
  const name = item.player?.name || item.player_name || `ESPN player ${item.player_external_id || ''}`.trim()
  const meta = [item.player?.position, item.player?.nfl_team].filter(Boolean).join(' · ')
  return item.player?.id ? <button onClick={() => onSelect(item.player!.id)} className="text-left text-[#e7eadf] underline decoration-white/20 underline-offset-4 hover:text-[#c9f958] hover:decoration-[#c9f958]/50">{name}{meta && <span className="ml-1.5 text-[10px] font-normal text-[#687064] no-underline">{meta}</span>}</button> : <span className="text-[#e0e4da]">{name}</span>
}

function TransactionRow({ transaction, onSelectPlayer }: { transaction: Transaction; onSelectPlayer: (id: string) => void }) {
  const when = transaction.processed_at || transaction.proposed_at
  const isTrade = transaction.transaction_type.startsWith('TRADE')
  const label = isTrade ? 'Trade' : transaction.transaction_type === 'WAIVER' ? 'Waiver claim' : 'Free-agent pickup'
  const teamMoves = new Map<string, { team: Team; added: TransactionItem[]; dropped: TransactionItem[]; received: TransactionItem[] }>()
  const entryFor = (team: Team) => {
    const entry = teamMoves.get(team.id) || { team, added: [], dropped: [], received: [] }
    teamMoves.set(team.id, entry)
    return entry
  }
  for (const item of transaction.items || []) {
    if (isTrade && item.to_team) entryFor(item.to_team).received.push(item)
    else if (item.item_type === 'DROP' && item.from_team) entryFor(item.from_team).dropped.push(item)
    else if (item.item_type === 'ADD' && item.to_team) entryFor(item.to_team).added.push(item)
    else if (item.to_team) entryFor(item.to_team).added.push(item)
    else if (item.from_team) entryFor(item.from_team).dropped.push(item)
  }
  return <article className="px-5 py-4">
    <div className="flex items-start justify-between gap-4"><div><span className="rounded-full border border-white/[.08] px-2 py-1 text-[9px] font-semibold uppercase tracking-[.08em] text-[#9ba394]">{label}</span>{transaction.bid_amount ? <span className="ml-2 text-[10px] text-[#83905f]">${transaction.bid_amount} FAAB</span> : null}</div>{when && <time className="whitespace-nowrap font-mono text-[9px] text-[#626a5f]">{new Date(when).toLocaleString()}</time>}</div>
    <div className="mt-4 space-y-4">{Array.from(teamMoves.values()).map(({ team, added, dropped, received }) => <div key={team.id} className="grid gap-2 sm:grid-cols-[170px_1fr]"><p className="truncate text-[13px] font-medium text-[#a5ada0]">{team.name}</p><div className="space-y-1.5">{received.length > 0 && <Move label="Received" tone="green" items={received} onSelect={onSelectPlayer} />}{added.length > 0 && <Move label="Added" tone="green" items={added} onSelect={onSelectPlayer} />}{dropped.length > 0 && <Move label="Dropped" tone="red" items={dropped} onSelect={onSelectPlayer} />}</div></div>)}</div>
    {!teamMoves.size && <p className="mt-3 text-xs text-[#737b70]">{transaction.initiated_by_team?.name || 'League transaction'} · {transaction.status.toLowerCase()}</p>}
    {transaction.expires_at && transaction.status === 'PENDING' && <p className="mt-3 text-[10px] text-[#70796c]">Expires {new Date(transaction.expires_at).toLocaleString()}</p>}
  </article>
}

function Move({ label, tone, items, onSelect }: { label: string; tone: 'green' | 'red'; items: TransactionItem[]; onSelect: (id: string) => void }) {
  return <div className="flex items-start gap-2 text-[13px]"><span className={`mt-0.5 w-16 shrink-0 text-[9px] font-semibold uppercase tracking-[.08em] ${tone === 'green' ? 'text-[#9dbe4e]' : 'text-[#a86f69]'}`}>{tone === 'green' ? '+' : '−'} {label}</span><div className="flex flex-wrap gap-x-3 gap-y-1">{items.map((item) => <PlayerButton key={item.id} item={item} onSelect={onSelect} />)}</div></div>
}
