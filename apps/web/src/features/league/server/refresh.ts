import 'server-only'

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { syncLeagueTransactions } from './transactions'

export type Provider = 'espn' | 'sleeper'

export type LeagueRecord = {
  id: string
  provider: Provider
  external_id: string
  season: number
}

type NormalizedPlayer = {
  externalId: string
  name?: string
  position?: string | null
  nflTeam?: string | null
  lineupSlot: string
  acquisitionType?: string | null
}

type NormalizedTeam = {
  externalId: string
  name: string
  wins?: number | null
  losses?: number | null
  ties?: number | null
  pointsFor?: number | null
  pointsAgainst?: number | null
  standing?: number | null
  raw: unknown
  players: NormalizedPlayer[]
}

type NormalizedMatchup = {
  externalId: string
  week: number
  homeTeamExternalId: string
  awayTeamExternalId: string
  homeScore: number | null
  awayScore: number | null
  homeProjected: number | null
  awayProjected: number | null
  status: 'scheduled' | 'final'
  raw: unknown
}

type NormalizedLeague = {
  name?: string | null
  week?: number | null
  teams: NormalizedTeam[]
  matchups: NormalizedMatchup[]
}

const ESPN_SLOT_NAMES: Record<number, string> = {
  0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'D/ST', 17: 'K', 20: 'BN', 21: 'IR', 23: 'FLEX',
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Live league refresh is not configured')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function providerJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25_000) })
  if (!response.ok) {
    const accessHint = response.status === 401 || response.status === 403 ? ' The league may be private.' : ''
    throw new Error(`Provider returned ${response.status}.${accessHint}`)
  }
  return response.json() as Promise<T>
}

function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

async function fetchEspn(league: LeagueRecord): Promise<NormalizedLeague> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${league.season}/segments/0/leagues/${league.external_id}?view=mSettings&view=mTeam&view=mRoster&view=mStandings&view=mMatchup`
  const data = await providerJson<any>(url)
  return {
    name: data.settings?.name,
    week: numberOrNull(data.scoringPeriodId),
    matchups: (data.schedule ?? []).flatMap((event: any) => {
      const week = numberOrNull(event.matchupPeriodId)
      if (!week || !event.home?.teamId || !event.away?.teamId) return []
      return [{
        externalId: String(event.id ?? `${week}-${event.home.teamId}-${event.away.teamId}`),
        week,
        homeTeamExternalId: String(event.home.teamId),
        awayTeamExternalId: String(event.away.teamId),
        homeScore: numberOrNull(event.home.totalPoints),
        awayScore: numberOrNull(event.away.totalPoints),
        homeProjected: numberOrNull(event.home.totalProjectedPointsLive ?? event.home.totalProjectedPoints),
        awayProjected: numberOrNull(event.away.totalProjectedPointsLive ?? event.away.totalProjectedPoints),
        status: event.winner && event.winner !== 'UNDECIDED' ? 'final' as const : 'scheduled' as const,
        raw: { winner: event.winner, playoffTierType: event.playoffTierType },
      }]
    }),
    teams: (data.teams ?? []).map((team: any) => ({
      externalId: String(team.id),
      name: team.name || (team.location && team.nickname ? `${team.location} ${team.nickname}` : `Team ${team.id}`),
      wins: numberOrNull(team.record?.overall?.wins),
      losses: numberOrNull(team.record?.overall?.losses),
      ties: numberOrNull(team.record?.overall?.ties),
      pointsFor: numberOrNull(team.record?.overall?.pointsFor),
      pointsAgainst: numberOrNull(team.record?.overall?.pointsAgainst),
      standing: numberOrNull(team.playoffSeed),
      raw: team.roster ?? {},
      players: (team.roster?.entries ?? []).flatMap((entry: any) => {
        const player = entry.playerPoolEntry?.player
        if (!player?.id) return []
        return [{
          externalId: String(player.id),
          name: player.fullName,
          position: player.defaultPositionId ? ESPN_SLOT_NAMES[player.defaultPositionId] ?? null : null,
          nflTeam: player.proTeamId ? String(player.proTeamId) : null,
          lineupSlot: ESPN_SLOT_NAMES[entry.lineupSlotId] ?? String(entry.lineupSlotId ?? 'BN'),
          acquisitionType: entry.acquisitionType ?? null,
        }]
      }),
    })),
  }
}

async function fetchSleeper(league: LeagueRecord): Promise<NormalizedLeague> {
  const base = 'https://api.sleeper.app/v1'
  const [info, rosters, users] = await Promise.all([
    providerJson<any>(`${base}/league/${league.external_id}`),
    providerJson<any[]>(`${base}/league/${league.external_id}/rosters`),
    providerJson<any[]>(`${base}/league/${league.external_id}/users`),
  ])
  if (!info || info.sport !== 'nfl') throw new Error('Sleeper league was not found or is not an NFL league')
  if (Number(info.season) !== league.season) throw new Error(`Sleeper league belongs to ${info.season}, not ${league.season}`)
  const usersById = new Map(users.map((user) => [String(user.user_id), user]))
  const ordered = [...rosters].sort((a, b) => Number(b.settings?.wins ?? 0) - Number(a.settings?.wins ?? 0) || Number(b.settings?.fpts ?? 0) - Number(a.settings?.fpts ?? 0))
  const standings = new Map(ordered.map((roster, index) => [String(roster.roster_id), index + 1]))
  return {
    name: info.name,
    week: numberOrNull(info.leg),
    matchups: [],
    teams: rosters.map((roster) => {
      const owner = usersById.get(String(roster.owner_id)) ?? {}
      const metadata = owner.metadata ?? {}
      const starters = new Set((roster.starters ?? []).map(String))
      const reserve = new Set((roster.reserve ?? []).map(String))
      const taxi = new Set((roster.taxi ?? []).map(String))
      const slot = (id: string) => starters.has(id) ? 'STARTER' : reserve.has(id) ? 'IR' : taxi.has(id) ? 'TAXI' : 'BN'
      return {
        externalId: String(roster.roster_id),
        name: metadata.team_name || owner.display_name || owner.username || `Team ${roster.roster_id}`,
        wins: numberOrNull(roster.settings?.wins),
        losses: numberOrNull(roster.settings?.losses),
        ties: numberOrNull(roster.settings?.ties),
        pointsFor: Number(roster.settings?.fpts ?? 0) + Number(roster.settings?.fpts_decimal ?? 0) / 100,
        pointsAgainst: Number(roster.settings?.fpts_against ?? 0) + Number(roster.settings?.fpts_against_decimal ?? 0) / 100,
        standing: standings.get(String(roster.roster_id)),
        raw: roster,
        players: (roster.players ?? []).map((id: unknown) => ({ externalId: String(id), lineupSlot: slot(String(id)) })),
      }
    }),
  }
}

export async function connectLeagueFromProvider(userId: string, input: { provider: Provider; externalId: string; season: number }) {
  const admin = adminClient()
  const provisional: LeagueRecord = { id: '', provider: input.provider, external_id: input.externalId, season: input.season }
  // Validate the provider response before creating any local records.
  const preview = input.provider === 'espn' ? await fetchEspn(provisional) : await fetchSleeper(provisional)
  if (!preview.teams.length) throw new Error('Provider returned no fantasy teams')

  const { data: league, error } = await admin.from('leagues').upsert({
    provider: input.provider,
    external_id: input.externalId,
    league_series_id: input.externalId,
    season: input.season,
    name: preview.name,
    status: 'pending',
  }, { onConflict: 'provider,external_id,season' }).select('id,provider,external_id,season').single()
  if (error) throw error

  await refreshLeagueFromProvider(league as LeagueRecord)
  const { error: linkError } = await admin.from('user_leagues').upsert({ user_id: userId, league_id: league.id }, { onConflict: 'user_id,league_id' })
  if (linkError) throw linkError
  const { data: connected, error: readError } = await admin.from('leagues').select('*').eq('id', league.id).single()
  if (readError) throw readError
  return connected
}

async function playerMap(provider: Provider, teams: NormalizedTeam[]) {
  const admin = adminClient()
  const externalIds = [...new Set(teams.flatMap((team) => team.players.map((player) => player.externalId)))]
  const mapping = new Map<string, string>()
  for (let index = 0; index < externalIds.length; index += 200) {
    const ids = externalIds.slice(index, index + 200)
    const { data, error } = await admin.from('player_external_ids').select('external_id,player_id').eq('provider', provider).in('external_id', ids)
    if (error) throw error
    for (const row of data ?? []) mapping.set(row.external_id, row.player_id)
  }
  const missing = externalIds.filter((id) => !mapping.has(id))
  if (missing.length) throw new Error(`${missing.length} roster player${missing.length === 1 ? '' : 's'} are missing from the player directory. Run global player ingestion, then retry.`)
  return mapping
}

export async function refreshLeagueFromProvider(league: LeagueRecord) {
  const admin = adminClient()
  const normalized = league.provider === 'espn' ? await fetchEspn(league) : await fetchSleeper(league)
  if (!normalized.teams.length) throw new Error('Provider returned no fantasy teams')
  const players = await playerMap(league.provider, normalized.teams)
  const fetchedAt = new Date().toISOString()

  let playerCount = 0
  const teamIds = new Map<string, string>()
  for (const team of normalized.teams) {
    const { data: dbTeam, error: teamError } = await admin.from('fantasy_teams').upsert({
      league_id: league.id,
      external_id: team.externalId,
      name: team.name,
      updated_at: fetchedAt,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      points_for: team.pointsFor,
      points_against: team.pointsAgainst,
      standing: team.standing,
    }, { onConflict: 'league_id,external_id' }).select('id').single()
    if (teamError) throw teamError
    teamIds.set(team.externalId, dbTeam.id)

    const rosterKey = team.players.map((player) => ({ id: player.externalId, slot: player.lineupSlot })).sort((a, b) => a.id.localeCompare(b.id))
    const snapshotPayload = {
      team_id: dbTeam.id,
      season: league.season,
      week: normalized.week,
      fetched_at: fetchedAt,
      raw_payload: team.raw,
      data_hash: digest(rosterKey),
    }
    const { data: snapshot, error: snapshotError } = await admin.from('roster_snapshots').upsert(snapshotPayload, {
      onConflict: 'team_id,season,week,data_hash',
    }).select('id').single()
    if (snapshotError) throw snapshotError

    const rosterRows = team.players.map((player) => ({
      roster_snapshot_id: snapshot.id,
      player_id: players.get(player.externalId)!,
      lineup_slot: player.lineupSlot,
      acquisition_type: player.acquisitionType ?? null,
    }))
    if (rosterRows.length) {
      const { error } = await admin.from('roster_players').upsert(rosterRows, { onConflict: 'roster_snapshot_id,player_id' })
      if (error) throw error
    }
    playerCount += rosterRows.length
  }

  const matchupRows = normalized.matchups.flatMap((matchup) => {
    const homeTeamId = teamIds.get(matchup.homeTeamExternalId)
    const awayTeamId = teamIds.get(matchup.awayTeamExternalId)
    if (!homeTeamId || !awayTeamId) return []
    return [{
      league_id: league.id,
      season: league.season,
      week: matchup.week,
      matchup_external_id: matchup.externalId,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_score: matchup.homeScore,
      away_score: matchup.awayScore,
      home_projected: matchup.homeProjected,
      away_projected: matchup.awayProjected,
      status: matchup.status,
      fetched_at: fetchedAt,
      raw_payload: matchup.raw,
    }]
  })
  if (matchupRows.length) {
    const { error } = await admin.from('league_matchups').upsert(matchupRows, {
      onConflict: 'league_id,season,week,matchup_external_id',
    })
    if (error) throw error
  }

  await syncLeagueTransactions(admin, league, teamIds, normalized.week, fetchedAt)

  // Advance the shared freshness marker only after every roster was saved.
  // Agent context and persisted recommendations use this timestamp to decide
  // whether their league data is still valid.
  const { error: leagueError } = await admin.from('leagues').update({
    name: normalized.name ?? undefined,
    status: 'succeeded',
    last_synced_at: fetchedAt,
    team_count: normalized.teams.length,
    current_week: normalized.week,
  }).eq('id', league.id)
  if (leagueError) throw leagueError

  return { refreshedAt: fetchedAt, teamCount: normalized.teams.length, playerCount, matchupCount: matchupRows.length }
}
