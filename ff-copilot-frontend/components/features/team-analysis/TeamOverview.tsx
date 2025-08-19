'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { createApiUrl } from '@/lib/api-config'

interface TeamAnalysisData {
  starting_wr_score: number
  starting_rb_score: number
  starting_te_score: number
  starting_qbs_score: number
  dst_score: number
  k_score: number
  bench_wr_score: number
  bench_rb_score: number
  bench_te_score: number
  bench_qbs_score: number
  overall_score: number
  team_name: string
  team_id: number
  starting_wr_score_percentile: number
  starting_wr_score_tier: string
  starting_rb_score_percentile: number
  starting_rb_score_tier: string
  starting_te_score_percentile: number
  starting_te_score_tier: string
  starting_qbs_score_percentile: number
  starting_qbs_score_tier: string
  dst_score_percentile: number
  dst_score_tier: string
  k_score_percentile: number
  k_score_tier: string
  bench_wr_score_percentile: number
  bench_wr_score_tier: string
  bench_rb_score_percentile: number
  bench_rb_score_tier: string
  bench_te_score_percentile: number
  bench_te_score_tier: string
  bench_qbs_score_percentile: number
  bench_qbs_score_tier: string
  overall_score_percentile: number
  overall_score_tier: string
}

interface LeagueStats {
  [key: string]: {
    mean: number
    std: number
    min: number
    max: number
    median: number
  }
}

interface ApiResponse {
  team_row: TeamAnalysisData[]
  league_stats: LeagueStats
}

function getTierColor(tier: string) {
  switch (tier) {
    case 'A': return 'bg-green-100 text-green-800'
    case 'B': return 'bg-blue-100 text-blue-800'
    case 'C': return 'bg-yellow-100 text-yellow-800'
    case 'D': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export function TeamOverview() {
  const [teamData, setTeamData] = useState<TeamAnalysisData | null>(null)
  const [leagueStats, setLeagueStats] = useState<LeagueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [startingLineupExpanded, setStartingLineupExpanded] = useState(true)
  const [benchExpanded, setBenchExpanded] = useState(true)

  // Get league parameters from auth context
  const { leagueId, year, teamName, teamId } = useAuth()

  useEffect(() => {
    const fetchTeamAnalysis = async () => {
      try {
        // Check if we have the required league parameters
        if (!leagueId || !year || !teamName || !teamId) {
          throw new Error('League information not available. Please ensure you are logged in and have selected a league.')
        }

        const params = new URLSearchParams({
          league_id: leagueId.toString(),
          year: year.toString(),
          team_name: teamName,
          team_id: teamId.toString()
        })
        
        const response = await fetch(createApiUrl('/get_team_analysis', params))
        if (!response.ok) {
          throw new Error('Failed to fetch team analysis')
        }
        const data: ApiResponse = await response.json()
        setTeamData(data.team_row[0]) // API returns array, take first item
        setLeagueStats(data.league_stats)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchTeamAnalysis()
  }, [leagueId, year, teamName, teamId])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Analysis</h1>
        <div className="text-center py-8">Loading team analysis...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Analysis</h1>
        <div className="text-center py-8 text-red-600">Error: {error}</div>
      </div>
    )
  }

  if (!teamData || !leagueStats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Analysis</h1>
        <div className="text-center py-8">No team data available</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Analysis</h1>
        <div className="mt-2">
          <h2 className="text-xl font-semibold text-black">{teamData.team_name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg text-black">Overall Score: {teamData.overall_score.toFixed(3)}</span>
            <span className="text-sm text-gray-600">(League Average: {leagueStats.overall_score.mean.toFixed(3)})</span>
            <span className={`px-6 py-3 rounded-full text-xl font-bold ${getTierColor(teamData.overall_score_tier)}`}>
              Grade: {teamData.overall_score_tier}
            </span>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Starting Lineup Card */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setStartingLineupExpanded(!startingLineupExpanded)}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Starting Lineup Report Card</h3>
              <span className="text-sm text-gray-500">
                {startingLineupExpanded ? '▼' : '▶'}
              </span>
            </div>
          </CardHeader>
          {startingLineupExpanded && (
            <CardContent>
              <div className="space-y-4">
                <div className="border-b border-gray-100 pb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Quarterback:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.starting_qbs_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.starting_qbs_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.starting_qbs_score_tier)}`}>
                        {teamData.starting_qbs_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.starting_qbs_score.mean.toFixed(3)}</span>
                  </div>
                </div>
                
                <div className="border-b border-gray-100 pb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Running Back:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.starting_rb_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.starting_rb_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.starting_rb_score_tier)}`}>
                        {teamData.starting_rb_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.starting_rb_score.mean.toFixed(3)}</span>
                  </div>
                </div>
                
                <div className="border-b border-gray-100 pb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Wide Receiver:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.starting_wr_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.starting_wr_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.starting_wr_score_tier)}`}>
                        {teamData.starting_wr_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.starting_wr_score.mean.toFixed(3)}</span>
                  </div>
                </div>
                
                <div className="border-b border-gray-100 pb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Tight End:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.starting_te_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.starting_te_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.starting_te_score_tier)}`}>
                        {teamData.starting_te_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.starting_te_score.mean.toFixed(3)}</span>
                  </div>
                </div>
                
                <div className="border-b border-gray-100 pb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Defense:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.dst_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.dst_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.dst_score_tier)}`}>
                        {teamData.dst_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.dst_score.mean.toFixed(3)}</span>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Kicker:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.k_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.k_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.k_score_tier)}`}>
                        {teamData.k_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.k_score.mean.toFixed(3)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
        
        {/* Bench Analysis Card */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setBenchExpanded(!benchExpanded)}>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Bench Report Card</h3>
              <span className="text-sm text-gray-500">
                {benchExpanded ? '▼' : '▶'}
              </span>
            </div>
          </CardHeader>
          {benchExpanded && (
            <CardContent>
              <div className="space-y-4">
                <div className="border-b border-gray-100 pb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Quarterback:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.bench_qbs_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.bench_qbs_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.bench_qbs_score_tier)}`}>
                        {teamData.bench_qbs_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.bench_qbs_score.mean.toFixed(3)}</span>
                  </div>
                </div>
                
                <div className="border-b border-gray-100 pb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Running Back:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.bench_rb_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.bench_rb_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.bench_rb_score_tier)}`}>
                        {teamData.bench_rb_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.bench_rb_score.mean.toFixed(3)}</span>
                  </div>
                </div>
                
                <div className="border-b border-gray-100 pb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Wide Receiver:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.bench_wr_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.bench_wr_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.bench_wr_score_tier)}`}>
                        {teamData.bench_wr_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.bench_wr_score.mean.toFixed(3)}</span>
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Tight End:</span>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Composite Score: {teamData.bench_te_score.toFixed(3)}</div>
                        <div className="text-sm text-gray-500">Better than {teamData.bench_te_score_percentile.toFixed(1)}% of league</div>
                      </div>
                      <span className={`px-4 py-2 rounded-lg text-base font-bold ${getTierColor(teamData.bench_te_score_tier)}`}>
                        {teamData.bench_te_score_tier}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>League Average: {leagueStats.bench_te_score.mean.toFixed(3)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
} 