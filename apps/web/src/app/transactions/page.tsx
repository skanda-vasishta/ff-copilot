'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { api } from '@/lib/api'
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
type TransactionResponse = { incoming: Transaction[]; outgoing: Transaction[]; league: Transaction[] }

export default function TransactionsPage() {
  const { scope, isLoading } = useActiveScope()
  const transactions = useQuery({
    queryKey: ['league-transactions', scope?.team.league_id, scope?.team.id],
    queryFn: () => api<TransactionResponse>(`/v1/leagues/${scope!.team.league_id}/transactions?team_id=${scope!.team.id}`),
    enabled: Boolean(scope),
  })

  if (isLoading) return <main className="mx-auto max-w-[1120px] p-8 text-sm text-[#8a9280]">Loading your workspace…</main>
  if (!scope) return <main className="mx-auto max-w-xl px-5 py-24 text-center"><h1 className="text-2xl font-semibold text-white">Add a team first</h1><p className="mt-3 text-sm text-[#78847e]">Connect an ESPN league to see trades and transactions.</p><Link href="/settings" className="mt-5 inline-flex h-9 items-center rounded-[6px] bg-[#c9f958] px-4 text-xs font-semibold text-[#11170a]">Open settings</Link></main>

  return <main className="mx-auto max-w-[1120px] px-4 py-7 sm:px-6 lg:px-8">
    <header><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#9dbe4e]">{scope.team.league.name || 'ESPN league'} · {scope.team.league.season}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.035em] text-[#eef1e9]">Trades & transactions</h1><p className="mt-2 text-sm text-[#78847e]">Offers involving {scope.team.name}, plus completed moves across the league.</p></header>
    {transactions.isError && <div className="mt-6 rounded-[10px] border border-red-400/20 bg-red-400/[.06] px-4 py-3 text-sm text-red-200">{transactions.error.message}</div>}
    <div className="mt-7 grid gap-5 lg:grid-cols-2">
      <TransactionSection title="Proposed to you" eyebrow="Incoming trades" empty="No outstanding offers from other teams." transactions={transactions.data?.incoming || []} highlight />
      <TransactionSection title="Proposed by you" eyebrow="Outgoing trades" empty="You have no outstanding offers." transactions={transactions.data?.outgoing || []} />
    </div>
    <div className="mt-5"><TransactionSection title="League activity" eyebrow="Completed transactions" empty="No completed trades or waiver moves have been synced yet." transactions={transactions.data?.league || []} /></div>
  </main>
}

function TransactionSection({ title, eyebrow, empty, transactions, highlight = false }: { title: string; eyebrow: string; empty: string; transactions: Transaction[]; highlight?: boolean }) {
  return <section className={`overflow-hidden rounded-[14px] border ${highlight ? 'border-[#c9f958]/20 bg-[#c9f958]/[.025]' : 'border-white/[.06] bg-white/[.022]'}`}>
    <div className="border-b border-white/[.06] px-5 py-4"><p className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#6e7568]">{eyebrow}</p><h2 className="mt-1 text-base font-semibold text-[#eef1e9]">{title}</h2></div>
    {transactions.length ? <div className="divide-y divide-white/[.055]">{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</div> : <p className="px-5 py-10 text-center text-sm text-[#747c70]">{empty}</p>}
  </section>
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const when = transaction.processed_at || transaction.proposed_at
  const label = transaction.transaction_type.startsWith('TRADE') ? 'Trade' : transaction.transaction_type === 'WAIVER' ? 'Waiver claim' : 'Free-agent pickup'
  const teams = new Map<string, { team: Team; players: string[] }>()
  for (const item of transaction.items || []) {
    const team = item.to_team || item.from_team
    if (!team) continue
    const entry = teams.get(team.id) || { team, players: [] }
    entry.players.push(item.player?.name || item.player_name || `ESPN player ${item.player_external_id || ''}`.trim())
    teams.set(team.id, entry)
  }
  return <article className="px-5 py-4">
    <div className="flex items-start justify-between gap-4"><div><span className="rounded-full border border-white/[.08] px-2 py-1 text-[9px] font-semibold uppercase tracking-[.08em] text-[#9ba394]">{label}</span>{transaction.bid_amount ? <span className="ml-2 text-[10px] text-[#83905f]">${transaction.bid_amount} FAAB</span> : null}</div>{when && <time className="whitespace-nowrap font-mono text-[9px] text-[#626a5f]">{new Date(when).toLocaleString()}</time>}</div>
    <div className="mt-3 space-y-2">{Array.from(teams.values()).map(({ team, players }) => <div key={team.id} className="flex gap-3 text-[13px]"><span className="w-32 shrink-0 truncate text-[#8f978a]">{team.name}</span><span className="text-[#e0e4da]">{players.join(', ')}</span></div>)}</div>
    {!teams.size && <p className="mt-3 text-xs text-[#737b70]">{transaction.initiated_by_team?.name || 'League transaction'} · {transaction.status.toLowerCase()}</p>}
    {transaction.expires_at && transaction.status === 'PENDING' && <p className="mt-3 text-[10px] text-[#70796c]">Expires {new Date(transaction.expires_at).toLocaleString()}</p>}
  </article>
}
