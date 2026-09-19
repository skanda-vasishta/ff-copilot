'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useActiveScope } from '@/lib/scope'

type Team = { id: string; name: string; wins?: number; losses?: number; ties?: number }
type MatchupResponse = { week: number; matchup: { status: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null; home_projected: number | null; away_projected: number | null; home_team: Team; away_team: Team } | null }

export function ScoreboardTicker() {
  const { scope } = useActiveScope()
  const query = useQuery({
    queryKey: ['scoreboard-ticker', scope?.team.id],
    queryFn: () => api<MatchupResponse>(`/v1/teams/${scope!.team.id}/matchup`),
    enabled: Boolean(scope),
    staleTime: 60_000,
  })
  const matchup = query.data?.matchup
  if (!scope || query.isLoading || !matchup) return null
  const mineIsHome = matchup.home_team_id === scope.team.id
  const mine = mineIsHome ? matchup.home_team : matchup.away_team
  const opponent = mineIsHome ? matchup.away_team : matchup.home_team
  const score = mineIsHome ? matchup.home_score : matchup.away_score
  const opponentScore = mineIsHome ? matchup.away_score : matchup.home_score
  const projected = mineIsHome ? matchup.home_projected : matchup.away_projected
  const opponentProjected = mineIsHome ? matchup.away_projected : matchup.home_projected
  const live = score != null || matchup.status === 'live'
  return <Link href={`/matchups?week=${query.data?.week}`} className="scoreboard-ticker focus-ring block border-b border-white/[.06] bg-[#171717] px-4 py-2 transition hover:bg-[#1e1e1e] sm:px-[22px]">
    <div className="mx-auto flex max-w-[1200px] items-center gap-3 overflow-hidden text-[11px]">
      <span className="shrink-0 font-mono text-[9px] font-semibold uppercase tracking-[.12em] text-[#c36761]">Week {query.data?.week}</span>
      <span className={`size-1.5 shrink-0 rounded-full ${live ? 'bg-[#d96b62]' : 'bg-[#777]'}`} aria-hidden />
      <span className="shrink-0 text-[#777]">{live ? 'Live matchup' : 'This week'}</span>
      <span className="min-w-0 truncate font-medium text-[#e7e7e7]">{mine.name}</span>
      <span className="font-mono font-semibold text-white">{score != null ? score.toFixed(1) : projected != null ? projected.toFixed(1) : '—'}</span>
      <span className="text-[#666]">–</span>
      <span className="min-w-0 truncate text-[#aaa]">{opponent.name}</span>
      <span className="font-mono text-[#aaa]">{opponentScore != null ? opponentScore.toFixed(1) : opponentProjected != null ? opponentProjected.toFixed(1) : '—'}</span>
      <span className="ml-auto shrink-0 text-[10px] font-semibold text-[#c36761]">Open matchup →</span>
    </div>
  </Link>
}
