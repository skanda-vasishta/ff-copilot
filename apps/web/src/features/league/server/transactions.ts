import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LeagueRecord } from './refresh'

type TeamIds = Map<string, string>

async function providerJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(25_000) })
  if (!response.ok) throw new Error(`Provider transactions returned ${response.status}`)
  return response.json() as Promise<T>
}

function iso(value: unknown): string | null {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? new Date(number).toISOString() : null
}

async function playerIds(admin: SupabaseClient, provider: string, externalIds: string[]) {
  const unique = [...new Set(externalIds.filter(Boolean))]
  const result = new Map<string, string>()
  for (let index = 0; index < unique.length; index += 200) {
    const { data, error } = await admin.from('player_external_ids').select('external_id,player_id')
      .eq('provider', provider).in('external_id', unique.slice(index, index + 200))
    if (error) throw error
    for (const row of data ?? []) result.set(row.external_id, row.player_id)
  }
  return result
}

async function persist(
  admin: SupabaseClient,
  league: LeagueRecord,
  teams: TeamIds,
  transactions: any[],
  fetchedAt: string,
) {
  const unique = new Map<string, any>()
  for (const transaction of transactions) {
    const id = transaction.id ?? transaction.transaction_id
    if (id != null) unique.set(String(id), transaction)
  }
  const values = [...unique.entries()]

  // Pending offers are ephemeral. A successful provider read is authoritative.
  const { error: deleteError } = await admin.from('league_transactions').delete()
    .eq('league_id', league.id).eq('status', 'PENDING')
  if (deleteError) throw deleteError
  if (!values.length) return 0

  const rows = values.map(([externalId, transaction]) => {
    const sleeperTeams = (transaction.roster_ids ?? []).map(String)
    const initiatingExternalId = transaction.teamId ?? transaction.proposedByTeamId ?? sleeperTeams[0] ?? null
    const rawStatus = String(transaction.status ?? '').toUpperCase()
    const isPending = rawStatus === 'PENDING' || rawStatus === 'PROPOSED'
    return {
      league_id: league.id,
      provider_transaction_id: externalId,
      transaction_type: String(transaction.type ?? 'UNKNOWN').toUpperCase(),
      status: isPending ? 'PENDING' : rawStatus || 'COMPLETE',
      initiated_by_team_id: initiatingExternalId == null ? null : teams.get(String(initiatingExternalId)),
      initiated_by_team_external_id: initiatingExternalId == null ? null : String(initiatingExternalId),
      proposed_at: iso(transaction.proposedDate ?? transaction.created),
      processed_at: iso(transaction.processDate ?? transaction.status_updated),
      expires_at: iso(transaction.expirationDate),
      bid_amount: transaction.bidAmount ?? transaction.settings?.waiver_bid ?? null,
      raw_payload: transaction,
      fetched_at: fetchedAt,
    }
  })
  const { data: stored, error } = await admin.from('league_transactions').upsert(rows, {
    onConflict: 'league_id,provider_transaction_id',
  }).select('id,provider_transaction_id')
  if (error) throw error
  const transactionIds = new Map((stored ?? []).map((row) => [row.provider_transaction_id, row.id]))
  const storedIds = [...transactionIds.values()]
  if (storedIds.length) {
    const { error: staleItemError } = await admin.from('league_transaction_items').delete().in('transaction_id', storedIds)
    if (staleItemError) throw staleItemError
  }

  const normalizedItems = values.flatMap(([externalId, transaction]) => {
    const espnItems = transaction.items ?? []
    const sleeperItems = [
      ...Object.entries(transaction.adds ?? {}).map(([playerId, rosterId]) => ({ type: 'ADD', playerId, toTeamId: rosterId })),
      ...Object.entries(transaction.drops ?? {}).map(([playerId, rosterId]) => ({ type: 'DROP', playerId, fromTeamId: rosterId })),
    ]
    return (espnItems.length ? espnItems : sleeperItems).map((item: any, index: number) => ({ externalId, item, index }))
  })
  const mappedPlayers = await playerIds(admin, league.provider, normalizedItems.map(({ item }) => String(item.playerId ?? '')))
  const itemRows = normalizedItems.flatMap(({ externalId, item, index }) => {
    const transactionId = transactionIds.get(externalId)
    if (!transactionId) return []
    const playerExternalId = item.playerId == null ? null : String(item.playerId)
    const fromExternalId = item.fromTeamId == null ? null : String(item.fromTeamId)
    const toExternalId = item.toTeamId == null ? null : String(item.toTeamId)
    return [{
      transaction_id: transactionId,
      item_index: index,
      item_type: String(item.type ?? 'UNKNOWN').toUpperCase(),
      player_id: playerExternalId ? mappedPlayers.get(playerExternalId) : null,
      player_external_id: playerExternalId,
      from_team_id: fromExternalId ? teams.get(fromExternalId) : null,
      from_team_external_id: fromExternalId,
      to_team_id: toExternalId ? teams.get(toExternalId) : null,
      to_team_external_id: toExternalId,
      raw_payload: item,
    }]
  })
  if (itemRows.length) {
    const { error: itemError } = await admin.from('league_transaction_items').upsert(itemRows, {
      onConflict: 'transaction_id,item_index',
    })
    if (itemError) throw itemError
  }
  return values.length
}

async function espnTransactions(league: LeagueRecord, currentWeek: number) {
  const base = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${league.season}/segments/0/leagues/${league.external_id}`
  const filter = JSON.stringify({ transactions: { filterType: { value: [
    'FREEAGENT', 'WAIVER', 'TRADE_ACCEPT', 'TRADE_PROPOSAL', 'TRADE_UPHOLD', 'TRADE_VETO', 'TRADE_DECLINE',
  ] } } })
  const periods = Array.from({ length: Math.min(Math.max(currentWeek, 1), 25) }, (_, index) => index + 1)
  const [history, pending] = await Promise.all([
    Promise.all(periods.map((period) => providerJson<any>(`${base}?view=mTransactions2&scoringPeriodId=${period}`, {
      headers: { 'x-fantasy-filter': filter },
    }))),
    providerJson<any>(`${base}?view=mPendingTransactions`),
  ])
  return [
    ...history.flatMap((payload) => payload.transactions ?? []),
    ...(pending.pendingTransactions ?? []).filter((transaction: any) =>
      String(transaction.type ?? '').toUpperCase().startsWith('TRADE')
      || (transaction.items ?? []).some((item: any) => String(item.type ?? '').toUpperCase() === 'TRADE')),
  ]
}

async function sleeperTransactions(league: LeagueRecord, currentWeek: number) {
  const weeks = Array.from({ length: Math.min(Math.max(currentWeek, 1), 18) }, (_, index) => index + 1)
  return (await Promise.all(weeks.map((week) =>
    providerJson<any[]>(`https://api.sleeper.app/v1/league/${league.external_id}/transactions/${week}`))))
    .flat()
}

export async function syncLeagueTransactions(
  admin: SupabaseClient,
  league: LeagueRecord,
  teams: TeamIds,
  currentWeek: number | null | undefined,
  fetchedAt: string,
) {
  const week = Number(currentWeek || 1)
  const transactions = league.provider === 'espn'
    ? await espnTransactions(league, week)
    : await sleeperTransactions(league, week)
  return persist(admin, league, teams, transactions, fetchedAt)
}
