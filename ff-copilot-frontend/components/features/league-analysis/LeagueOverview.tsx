'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PlayerCard } from '@/components/features/team-analysis/PlayerCard'
import { useState, useEffect } from 'react'
import { useLeague } from '@/contexts/LeagueContext'

interface TeamComparison {
  team_name: string
  team_id: number
  overall_score: number
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
  overall_score_percentile: number
  overall_score_tier: string
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
}

interface LeagueStats {
  overall_score: {
    mean: number
    std: number
    min: number
    max: number
    median: number
  }
  [key: string]: {
    mean: number
    std: number
    min: number
    max: number
    median: number
  }
}

interface LeagueData {
  comparisons: TeamComparison[]
  league_stats: LeagueStats
}

interface TeamAnalysisData {
  team_row: TeamComparison[]
  league_stats: LeagueStats
}

interface PlayerData {
  name: string
  position: string
  composite_score: number
  production_score: number
  reliability_score: number
  sentiment_score: number
  value_score: number
  position_rank: number
  raw_stats: Array<{
    proTeam: string
    injuryStatus: string
    injured: boolean
    total_points: number
    avg_points: number
    projected_total_points: number
    projected_avg_points: number
    percent_owned: number
    percent_started: number
  }>
  sentiment: {
    reddit_summary: string
    reddit_sentiment_score: number
    fantasypros_summary: string
    fantasypros_sentiment_score: number
    espn_summary: string
    espn_sentiment_score: number
    overall_summary: string
    overall_sentiment_score: number
  } | number
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

export function LeagueOverview() {
  const { leagueId, year, teamName, teamId, hasLeagueParams } = useLeague()
  const [leagueData, setLeagueData] = useState<LeagueData | null>(null)
  const [teamAnalysis, setTeamAnalysis] = useState<TeamAnalysisData | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<TeamComparison | null>(null)
  const [rosterData, setRosterData] = useState<PlayerData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'league' | 'team'>('league')
  const [startingLineupExpanded, setStartingLineupExpanded] = useState(true)
  const [benchExpanded, setBenchExpanded] = useState(true)



  useEffect(() => {
    fetchLeagueData()
  }, [leagueId, year, teamName, teamId])

  const fetchLeagueData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      if (!hasLeagueParams()) {
        setError('League parameters not configured. Please set up your league first.')
        setLoading(false)
        return
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const params = new URLSearchParams({
        league_id: leagueId!.toString(),
        year: year!.toString(),
        team_name: teamName!,
        team_id: teamId!.toString()
      });
      const response = await fetch(`${API_BASE_URL}/add_league_comparisons?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch league analysis data')
      }
      
      const data = await response.json()
      
      // Sort teams by overall score (descending)
      data.comparisons.sort((a: TeamComparison, b: TeamComparison) => b.overall_score - a.overall_score)
      
      setLeagueData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const fetchTeamAnalysis = async (teamName: string, teamId: number) => {
    try {
      setLoading(true)
      setError(null)
      
      // ONLY use league ID for other team analysis, not user's team info
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const params = new URLSearchParams({
        league_id: leagueId!.toString(),
        year: year!.toString(),
        team_name: teamName,
        team_id: teamId.toString()
      });
      
      const response = await fetch(`${API_BASE_URL}/get_team_analysis?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch team analysis data')
      }
      
      const data = await response.json()
      setTeamAnalysis(data)
      
      // Fetch roster data for the selected team
      await fetchTeamRoster(teamName, teamId)
      
      setView('team')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const fetchTeamRoster = async (teamName: string, teamId: number) => {
    try {
      // Reset roster data first
      setRosterData([])
      
      // ONLY use league ID for other team roster, not user's team info
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
      const params = new URLSearchParams({
        league_id: leagueId!.toString(),
        year: year!.toString(),
        team_name: teamName,
        team_id: teamId.toString()
      });
      
      const response = await fetch(`${API_BASE_URL}/get_team_roster?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch roster data')
      }
      
      const data = await response.json()
      // Handle different possible response structures
      if (data.players) {
        setRosterData(data.players)
      } else if (Array.isArray(data)) {
        setRosterData(data)
      } else {
        setRosterData([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setRosterData([]) // Ensure it's always an array
    }
  }

  const handleTeamAnalysisClick = (team: TeamComparison) => {
    setSelectedTeam(team)
    fetchTeamAnalysis(team.team_name, team.team_id)
  }

  const handleBackToLeague = () => {
    setView('league')
    setSelectedTeam(null)
    setTeamAnalysis(null)
    setRosterData([])
  }

  const formatScore = (score: number): string => {
    return score.toFixed(3)
  }

  const calculateStartingLineupAvg = (team: TeamComparison): number => {
    return (team.starting_wr_score + team.starting_rb_score + team.starting_te_score + 
            team.starting_qbs_score + team.dst_score + team.k_score) / 6
  }

  const calculateBenchDepthAvg = (team: TeamComparison): number => {
    return (team.bench_wr_score + team.bench_rb_score + team.bench_te_score + 
            team.bench_qbs_score) / 4
  }

  const isUserTeam = (team: TeamComparison): boolean => {
    return team.team_name === teamName
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {view === 'team' ? `Team Analysis - ${selectedTeam?.team_name}` : 'League Analysis'}
        </h1>
        <div className="flex justify-center items-center h-64">
          <div className="text-lg text-gray-600">
            {view === 'team' ? 'Loading team analysis...' : 'Loading league analysis...'}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {view === 'team' ? `Team Analysis - ${selectedTeam?.team_name}` : 'League Analysis'}
        </h1>
        <div className="flex justify-center items-center h-64">
          <div className="text-lg text-red-600">Error: {error}</div>
        </div>
        {view === 'team' && (
          <div className="flex justify-center">
            <Button onClick={handleBackToLeague} variant="outline">
              Back to League
            </Button>
          </div>
        )}
      </div>
    )
  }

  // Team Analysis View - using exact same UI as TeamOverview
  if (view === 'team' && teamAnalysis && selectedTeam) {
    const teamData = teamAnalysis.team_row[0]
    const { league_stats } = teamAnalysis

    return (
      <div className="container mx-auto px-4 py-8">
        {/* Use exact same UI structure as TeamOverview */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button onClick={handleBackToLeague} variant="outline">
              ← Back to League
            </Button>
          </div>
          
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Team Analysis</h1>
            <div className="mt-2">
              <h2 className="text-xl font-semibold text-black">{teamData.team_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                                 <span className="text-lg text-black">Overall Score (Standardized): {teamData.overall_score.toFixed(3)}</span>
                <span className="text-sm text-gray-600">(League Average: {league_stats.overall_score.mean.toFixed(3)})</span>
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
                        <span>League Average: {league_stats.starting_qbs_score.mean.toFixed(3)}</span>
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
                        <span>League Average: {league_stats.starting_rb_score.mean.toFixed(3)}</span>
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
                        <span>League Average: {league_stats.starting_wr_score.mean.toFixed(3)}</span>
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
                        <span>League Average: {league_stats.starting_te_score.mean.toFixed(3)}</span>
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
                        <span>League Average: {league_stats.dst_score.mean.toFixed(3)}</span>
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
                        <span>League Average: {league_stats.k_score.mean.toFixed(3)}</span>
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
                        <span>League Average: {league_stats.bench_qbs_score.mean.toFixed(3)}</span>
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
                        <span>League Average: {league_stats.bench_rb_score.mean.toFixed(3)}</span>
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
                        <span>League Average: {league_stats.bench_wr_score.mean.toFixed(3)}</span>
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
                        <span>League Average: {league_stats.bench_te_score.mean.toFixed(3)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>

          {/* Players Section - exact same as team-analysis page */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-6 text-black">{teamData.team_name} Players</h2>
            {rosterData && rosterData.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                {rosterData.map((player, index) => (
                  <PlayerCard key={index} player={player} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-600">No player data available</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // League Overview View (original)
  if (!leagueData) {
    return null
  }

  const { comparisons, league_stats } = leagueData

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">League Analysis</h1>
      
      {/* League Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{comparisons.length}</p>
              <p className="text-sm text-gray-600">Teams</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{formatScore(league_stats.overall_score.mean)}</p>
              <p className="text-sm text-gray-600">Avg Overall Score</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{formatScore(league_stats.overall_score.max)}</p>
              <p className="text-sm text-gray-600">Highest Score</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">{formatScore(league_stats.overall_score.min)}</p>
              <p className="text-sm text-gray-600">Lowest Score</p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Team Standings */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Team Standings (Sorted by Overall Score)</h2>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4">Rank</th>
                  <th className="text-left py-3 px-4">Team</th>
                  <th className="text-left py-3 px-4">Overall Score (Standardized)</th>
                  <th className="text-left py-3 px-4">Overall Tier</th>
                  <th className="text-left py-3 px-4">Starting Avg</th>
                  <th className="text-left py-3 px-4">Bench Avg</th>
                  <th className="text-left py-3 px-4">QB</th>
                  <th className="text-left py-3 px-4">RB</th>
                  <th className="text-left py-3 px-4">WR</th>
                  <th className="text-left py-3 px-4">TE</th>
                  <th className="text-left py-3 px-4">K</th>
                  <th className="text-left py-3 px-4">DST</th>
                  <th className="text-left py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((team, index) => (
                  <tr 
                    key={team.team_id} 
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      isUserTeam(team) ? 'bg-green-50' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-medium">#{index + 1}</td>
                    <td className="py-3 px-4 font-medium">
                      {team.team_name}
                      {isUserTeam(team) && (
                        <span className="ml-2 text-xs bg-green-200 text-green-800 px-2 py-1 rounded">
                          Your Team
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-blue-600">{formatScore(team.overall_score)}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded ${getTierColor(team.overall_score_tier)}`}>
                        {team.overall_score_tier}
                      </span>
                    </td>
                    <td className="py-3 px-4">{formatScore(calculateStartingLineupAvg(team))}</td>
                    <td className="py-3 px-4">{formatScore(calculateBenchDepthAvg(team))}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span>{formatScore(team.starting_qbs_score)}</span>
                        <span className={`text-xs px-1 py-0.5 rounded ${getTierColor(team.starting_qbs_score_tier)}`}>
                          {team.starting_qbs_score_tier}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span>{formatScore(team.starting_rb_score)}</span>
                        <span className={`text-xs px-1 py-0.5 rounded ${getTierColor(team.starting_rb_score_tier)}`}>
                          {team.starting_rb_score_tier}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span>{formatScore(team.starting_wr_score)}</span>
                        <span className={`text-xs px-1 py-0.5 rounded ${getTierColor(team.starting_wr_score_tier)}`}>
                          {team.starting_wr_score_tier}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span>{formatScore(team.starting_te_score)}</span>
                        <span className={`text-xs px-1 py-0.5 rounded ${getTierColor(team.starting_te_score_tier)}`}>
                          {team.starting_te_score_tier}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span>{formatScore(team.k_score)}</span>
                        <span className={`text-xs px-1 py-0.5 rounded ${getTierColor(team.k_score_tier)}`}>
                          {team.k_score_tier}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1">
                        <span>{formatScore(team.dst_score)}</span>
                        <span className={`text-xs px-1 py-0.5 rounded ${getTierColor(team.dst_score_tier)}`}>
                          {team.dst_score_tier}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {!isUserTeam(team) && (
                        <Button 
                          onClick={() => handleTeamAnalysisClick(team)}
                          className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1"
                        >
                          Analyze
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          

        </CardContent>
      </Card>

      {/* League Statistics Summary */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">League Statistics Summary</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">Overall Score Distribution</h3>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Mean:</span>
                  <span className="font-medium">{formatScore(league_stats.overall_score.mean)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Median:</span>
                  <span className="font-medium">{formatScore(league_stats.overall_score.median)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Std Dev:</span>
                  <span className="font-medium">{formatScore(league_stats.overall_score.std)}</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">Tier Distribution</h3>
              <div className="flex flex-wrap gap-2">
                {['A', 'B', 'C', 'D', 'F'].map(tier => {
                  const count = comparisons.filter(team => team.overall_score_tier === tier).length
                  return (
                    <span key={tier} className={`text-xs px-2 py-1 rounded ${getTierColor(tier)}`}>
                      {tier}: {count}
                    </span>
                  )
                })}
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-medium text-gray-900">Score Range</h3>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Range:</span>
                  <span className="font-medium">
                    {formatScore(league_stats.overall_score.max - league_stats.overall_score.min)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Min-Max:</span>
                  <span className="font-medium">
                    {formatScore(league_stats.overall_score.min)} - {formatScore(league_stats.overall_score.max)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 