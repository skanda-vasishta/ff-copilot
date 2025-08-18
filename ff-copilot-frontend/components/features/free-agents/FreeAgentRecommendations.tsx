'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface FreeAgent {
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
    [key: string]: any
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

export function FreeAgentRecommendations() {
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('composite_score')

  // Get league parameters from auth context
  const { leagueId, year, teamName, teamId } = useAuth()

  const leagueParams = {
    league_id: leagueId,
    year: year,
    team_name: teamName,
    team_id: teamId
  }

  useEffect(() => {
    fetchRecommendations()
  }, [])

  const fetchRecommendations = async (position?: string, sortByScore?: string) => {
    try {
      setLoading(true)
      setError(null)
      
      // Check if we have the required league parameters
      if (!leagueId || !year || !teamName || !teamId) {
        throw new Error('League information not available. Please ensure you are logged in and have selected a league.')
      }
      
      const params = new URLSearchParams(leagueParams as any)
      
      // Add optional parameters
      if (position) {
        params.append('position', position)
      }
      if (sortByScore) {
        params.append('sort_by_score', sortByScore)
      }
      
      const response = await fetch(`http://localhost:8000/recommend_free_agents?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch free agent recommendations')
      }
      
      const data = await response.json()
      setFreeAgents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = () => {
    fetchRecommendations(selectedPosition || undefined, sortBy)
  }

  const formatScore = (score: number): string => {
    return score.toFixed(3)
  }

  const getScoreColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600 font-semibold'
    if (score >= 0.6) return 'text-blue-600 font-semibold'
    if (score >= 0.4) return 'text-yellow-600 font-semibold'
    return 'text-red-600 font-semibold'
  }

  const getInjuryStatusColor = (status: string): string => {
    switch (status?.toUpperCase()) {
      case 'HEALTHY':
      case 'ACTIVE':
        return 'text-green-600 bg-green-100'
      case 'QUESTIONABLE':
        return 'text-yellow-600 bg-yellow-100'
      case 'DOUBTFUL':
        return 'text-orange-600 bg-orange-100'
      case 'OUT':
      case 'IR':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getAvailabilityColor = (percentOwned: number): string => {
    if (percentOwned === 0) return 'bg-green-100 text-green-800'
    if (percentOwned < 10) return 'bg-blue-100 text-blue-800'
    if (percentOwned < 25) return 'bg-yellow-100 text-yellow-800'
    return 'bg-orange-100 text-orange-800'
  }

  const getAvailabilityText = (percentOwned: number): string => {
    if (percentOwned === 0) return 'Available'
    if (percentOwned < 10) return 'Lightly Owned'
    if (percentOwned < 25) return 'Moderately Owned'
    return 'Heavily Owned'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Free Agent Recommendations</h1>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Filters</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select 
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              value={selectedPosition}
              onChange={(e) => setSelectedPosition(e.target.value)}
            >
              <option value="">All Positions</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
              <option value="K">K</option>
              <option value="D/ST">D/ST</option>
            </select>
            
            <select 
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="composite_score">Composite Score</option>
              <option value="production_score">Production Score</option>
              <option value="reliability_score">Reliability Score</option>
              <option value="sentiment_score">Sentiment Score</option>
              <option value="value_score">Value Score</option>
            </select>
            
            <Button 
              onClick={handleFilterChange}
              disabled={loading}
              className="bg-blue-500 hover:bg-blue-600 text-white"
            >
              {loading ? 'Loading...' : 'Get Recommendations'}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {freeAgents.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {freeAgents.map((agent, index) => {
              const rawStats = agent.raw_stats?.[0]
              const percentOwned = rawStats?.percent_owned || 0
              
              return (
                <Card key={`${agent.name}-${index}`} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-gray-900">{agent.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-sm text-gray-600">
                            {agent.position} - {rawStats?.proTeam || 'N/A'}
                          </p>
                          {rawStats?.injuryStatus && rawStats.injuryStatus !== 'ACTIVE' && (
                            <span className={`text-xs px-2 py-1 rounded ${getInjuryStatusColor(rawStats.injuryStatus)}`}>
                              {rawStats.injuryStatus}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${getAvailabilityColor(percentOwned)}`}>
                        {getAvailabilityText(percentOwned)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {/* Primary Scores */}
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Composite Score:</span>
                          <span className={`text-sm font-medium ${getScoreColor(agent.composite_score)}`}>
                            {formatScore(agent.composite_score)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Position Rank:</span>
                          <span className="text-sm font-medium">#{agent.position_rank}</span>
                        </div>
                      </div>

                      {/* Secondary Scores */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Production:</span>
                          <span className={getScoreColor(agent.production_score)}>{formatScore(agent.production_score)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Reliability:</span>
                          <span className={getScoreColor(agent.reliability_score)}>{formatScore(agent.reliability_score)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Sentiment:</span>
                          <span className={getScoreColor(agent.sentiment_score)}>{formatScore(agent.sentiment_score)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Value:</span>
                          <span className={getScoreColor(agent.value_score)}>{formatScore(agent.value_score)}</span>
                        </div>
                      </div>

                      {/* Stats */}
                      {rawStats && (
                        <div className="border-t pt-3 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">% Owned:</span>
                            <span className="text-sm font-medium">{rawStats.percent_owned.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Projected Total:</span>
                            <span className="text-sm font-medium">{rawStats.projected_total_points.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Projected Avg:</span>
                            <span className="text-sm font-medium">{rawStats.projected_avg_points.toFixed(1)}</span>
                          </div>
                        </div>
                      )}

                      
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          
                     <div className="text-center">
             <p className="text-gray-600">
               Showing {freeAgents.length} free agent{freeAgents.length !== 1 ? 's' : ''} 
               {selectedPosition && ` (${selectedPosition} only)`}
             </p>
           </div>
        </>
      ) : (
        !loading && (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-gray-600">
                {error ? 'Unable to load recommendations.' : 'No free agents found. Try adjusting your filters.'}
              </p>
            </CardContent>
          </Card>
        )
      )}
      
      {loading && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-600">Loading free agent recommendations...</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 