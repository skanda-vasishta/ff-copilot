export type EspnDraftPick = {
  id: number
  overallPickNumber: number
  roundId: number
  roundPickNumber: number
  teamId: number
  playerId: number
  keeper: boolean
  bidAmount: number
}

export type EspnDraftTeam = {
  id: number
  name: string
  abbrev: string
  logo?: string
}

export type EspnDraftPayload = {
  id: number
  seasonId: number
  draftDetail: { drafted: boolean; inProgress: boolean; picks: EspnDraftPick[] }
  settings: {
    name: string
    draftSettings: { date: number; type: string; timePerSelection: number; pickOrder: number[] }
    scoringSettings?: { playerRankType?: string }
    rosterSettings?: { lineupSlotCounts?: Record<string, number> }
  }
  teams: EspnDraftTeam[]
}

export function parseEspnLeagueInput(value: string): string | null {
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    const queryId = url.searchParams.get('leagueId') || url.searchParams.get('league_id')
    if (queryId && /^\d+$/.test(queryId)) return queryId
    const match = url.pathname.match(/(?:leagues?|leagueId)[=/]?(\d+)/i)
    return match?.[1] || null
  } catch {
    return trimmed.match(/(?:leagueId|leagues?)[=/](\d+)/i)?.[1] || null
  }
}

export function espnDraftUrl(leagueId: string, season: number) {
  const url = new URL(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`)
  url.searchParams.append('view', 'mDraftDetail')
  url.searchParams.append('view', 'mTeam')
  url.searchParams.append('view', 'mSettings')
  return url.toString()
}

export function draftStatus(payload: EspnDraftPayload): 'scheduled' | 'live' | 'complete' {
  if (payload.draftDetail.drafted) return 'complete'
  if (payload.draftDetail.inProgress) return 'live'
  return 'scheduled'
}
