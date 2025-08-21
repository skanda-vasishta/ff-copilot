'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useState, useEffect } from 'react'
import { useLeague } from '@/contexts/LeagueContext'

interface PlayerRanking {
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
    projected_total_points: number
    projected_avg_points: number
    posRank: any
    [key: string]: any
  }>
}

export function RankingsTable() {
  const { leagueId, year, teamName, teamId, hasLeagueParams } = useLeague()
  const [players, setPlayers] = useState<PlayerRanking[]>([])
  const [filteredPlayers, setFilteredPlayers] = useState<PlayerRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('composite_score')
  const [currentPage, setCurrentPage] = useState(1)
  const [playersPerPage, setPlayersPerPage] = useState(25)

  useEffect(() => {
    fetchPlayers()
  }, [leagueId, year, teamName, teamId])

  useEffect(() => {
    filterAndSortPlayers()
    setCurrentPage(1) // Reset to first page when filters change
  }, [players, selectedPosition, sortBy])

  const fetchPlayers = async () => {
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
      const response = await fetch(`${API_BASE_URL}/evaluate_all_players?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch player rankings')
      }
      
      const data = await response.json()
      setPlayers(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const filterAndSortPlayers = () => {
    let filtered = players

    // Filter by position
    if (selectedPosition) {
      filtered = filtered.filter(player => player.position === selectedPosition)
    }



    // Sort by selected metric
    filtered = filtered.sort((a, b) => {
      let aValue: number
      let bValue: number

      if (sortBy === 'projected_total_points' || sortBy === 'projected_avg_points') {
        aValue = getProjectionValue(a, sortBy)
        bValue = getProjectionValue(b, sortBy)
      } else if (sortBy === 'position_rank_value') {
        aValue = getPositionRank(a) || 999
        bValue = getPositionRank(b) || 999
        return aValue - bValue // Ascending for rank
      } else {
        aValue = a[sortBy as keyof PlayerRanking] as number
        bValue = b[sortBy as keyof PlayerRanking] as number
      }
      
      return bValue - aValue // Descending order for most metrics
    })

    setFilteredPlayers(filtered)
  }

  const getTeamAbbr = (player: PlayerRanking): string => {
    if (player.raw_stats && player.raw_stats.length > 0) {
      return player.raw_stats[0].proTeam || 'N/A'
    }
    return 'N/A'
  }

  const getProjectionValue = (player: PlayerRanking, field: string): number => {
    if (player.raw_stats && player.raw_stats.length > 0) {
      return player.raw_stats[0][field] || 0
    }
    return 0
  }

  const getPositionRank = (player: PlayerRanking): number | null => {
    if (player.raw_stats && player.raw_stats.length > 0) {
      const posRank = player.raw_stats[0].posRank
      // Handle the case where posRank might be an array or other format
      if (Array.isArray(posRank) && posRank.length > 0) {
        return posRank[0]
      } else if (typeof posRank === 'number') {
        return posRank
      }
    }
    return player.position_rank || null
  }

  const formatScore = (score: number): string => {
    return score.toFixed(3)
  }

  const formatProjection = (score: number): string => {
    return score.toFixed(1)
  }

  const getSortDisplayName = (sortKey: string): string => {
    const names: { [key: string]: string } = {
      composite_score: 'Composite Score',
      production_score: 'Production Score',
      reliability_score: 'Reliability Score',
      sentiment_score: 'Sentiment Score',
      value_score: 'Value Score',
      projected_total_points: 'Projected Total Points',
      projected_avg_points: 'Projected Avg Points',
      position_rank_value: 'Position Rank'
    }
    return names[sortKey] || sortKey
  }

  // Pagination logic
  const indexOfLastPlayer = currentPage * playersPerPage
  const indexOfFirstPlayer = indexOfLastPlayer - playersPerPage
  const currentPlayers = filteredPlayers.slice(indexOfFirstPlayer, indexOfLastPlayer)
  const totalPages = Math.ceil(filteredPlayers.length / playersPerPage)

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber)
  }

  const handlePlayersPerPageChange = (newPerPage: number) => {
    setPlayersPerPage(newPerPage)
    setCurrentPage(1)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Player Rankings</h1>
        <div className="flex justify-center items-center h-64">
          <div className="text-lg text-gray-600">Loading player rankings...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Player Rankings</h1>
        <div className="flex justify-center items-center h-64">
          <div className="text-lg text-red-600">Error: {error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Player Rankings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <select 
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          value={selectedPosition}
          onChange={(e) => setSelectedPosition(e.target.value)}
        >
          <option value="">All Positions</option>
          <option value="QB">Quarterbacks</option>
          <option value="RB">Running Backs</option>
          <option value="WR">Wide Receivers</option>
          <option value="TE">Tight Ends</option>
          <option value="K">Kickers</option>
          <option value="DST">Defense/ST</option>
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
          <option value="projected_total_points">Projected Total Points</option>
          <option value="projected_avg_points">Projected Avg Points</option>
          <option value="position_rank_value">Position Rank</option>
        </select>
        
        <Button 
          onClick={fetchPlayers}
          className="bg-blue-500 hover:bg-blue-600 text-white"
        >
          Apply
        </Button>
      </div>

      {/* Players per page selector */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm text-gray-600">Show:</span>
        <select 
          className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-black"
          value={playersPerPage}
          onChange={(e) => handlePlayersPerPageChange(parseInt(e.target.value))}
        >
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span className="text-sm text-gray-600">players per page</span>
      </div>
      
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            Rankings - {selectedPosition || 'All Positions'} (Sorted by {getSortDisplayName(sortBy)})
          </h2>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4">Rank</th>
                  <th className="text-left py-3 px-4">Player</th>
                  <th className="text-left py-3 px-4">Position</th>
                  <th className="text-left py-3 px-4">Team</th>
                  <th className="text-left py-3 px-4">Pos Rank</th>
                  <th className="text-left py-3 px-4">Proj Total</th>
                  <th className="text-left py-3 px-4">Proj Avg</th>
                  <th className="text-left py-3 px-4">Composite</th>
                  <th className="text-left py-3 px-4">Production</th>
                  <th className="text-left py-3 px-4">Reliability</th>
                  <th className="text-left py-3 px-4">Sentiment</th>
                  <th className="text-left py-3 px-4">Value</th>
                </tr>
              </thead>
              <tbody>
                {currentPlayers.map((player, index) => (
                  <tr key={`${player.name}-${player.position}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">#{indexOfFirstPlayer + index + 1}</td>
                    <td className="py-3 px-4 font-medium">{player.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {player.position}
                      </span>
                    </td>
                    <td className="py-3 px-4">{getTeamAbbr(player)}</td>
                    <td className="py-3 px-4">{getPositionRank(player) || 'N/A'}</td>
                    <td className="py-3 px-4">{formatProjection(getProjectionValue(player, 'projected_total_points'))}</td>
                    <td className="py-3 px-4">{formatProjection(getProjectionValue(player, 'projected_avg_points'))}</td>
                    <td className="py-3 px-4 font-medium">{formatScore(player.composite_score)}</td>
                    <td className="py-3 px-4">{formatScore(player.production_score)}</td>
                    <td className="py-3 px-4">{formatScore(player.reliability_score)}</td>
                    <td className="py-3 px-4">{formatScore(player.sentiment_score)}</td>
                    <td className="py-3 px-4">{formatScore(player.value_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {indexOfFirstPlayer + 1} to {Math.min(indexOfLastPlayer, filteredPlayers.length)} of {filteredPlayers.length} players
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="text-sm"
              >
                Previous
              </Button>
              
              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`px-3 py-1 text-sm border rounded ${
                        currentPage === pageNum
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <Button 
                variant="outline" 
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="text-sm"
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 