'use client'

import { Button } from '@/components/ui/Button'
import { useState, useEffect } from 'react'
import { useLeague } from '@/contexts/LeagueContext'

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

function getScoreColor(score: number) {
  if (score >= 0.8) return 'text-green-600 font-semibold'
  if (score >= 0.6) return 'text-blue-600 font-semibold'
  if (score >= 0.4) return 'text-yellow-600 font-semibold'
  return 'text-red-600 font-semibold'
}

function getSentimentColor(score: number) {
  if (score >= 8) return 'text-green-600 font-semibold'
  if (score >= 6) return 'text-blue-600 font-semibold'
  if (score >= 4) return 'text-yellow-600 font-semibold'
  return 'text-red-600 font-semibold'
}

function getInjuryStatusColor(status: string) {
  switch (status.toUpperCase()) {
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

export function PlayerSearch() {
  const { leagueId, year, teamName, teamId, hasLeagueParams } = useLeague()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerData | null>(null)
  const [allPlayers, setAllPlayers] = useState<PlayerData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<PlayerData[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  
  // Comparison state
  const [isComparing, setIsComparing] = useState(false)
  const [comparisonPlayers, setComparisonPlayers] = useState<PlayerData[]>([])
  const [comparisonSearchTerm, setComparisonSearchTerm] = useState('')
  const [comparisonSuggestions, setComparisonSuggestions] = useState<PlayerData[]>([])
  const [showComparisonSuggestions, setShowComparisonSuggestions] = useState(false)

  // Fetch all players on component mount
  useEffect(() => {
    const fetchAllPlayers = async () => {
      try {
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
          throw new Error('Failed to fetch players')
        }
        const data = await response.json()
        setAllPlayers(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load players')
      } finally {
        setLoading(false)
      }
    }

    fetchAllPlayers()
  }, [leagueId, year, teamName, teamId])

  // Update suggestions for main search
  useEffect(() => {
    if (searchTerm.trim().length >= 2) {
      const filtered = allPlayers
        .filter(player => 
          player.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .slice(0, 10)
      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [searchTerm, allPlayers])

  // Update suggestions for comparison search
  useEffect(() => {
    if (comparisonSearchTerm.trim().length >= 2) {
      const filtered = allPlayers
        .filter(player => 
          player.name.toLowerCase().includes(comparisonSearchTerm.toLowerCase()) &&
          !comparisonPlayers.some(cp => cp.name === player.name) // Exclude already selected players
        )
        .slice(0, 10)
      setComparisonSuggestions(filtered)
      setShowComparisonSuggestions(filtered.length > 0)
    } else {
      setComparisonSuggestions([])
      setShowComparisonSuggestions(false)
    }
  }, [comparisonSearchTerm, allPlayers, comparisonPlayers])

  const handleSearch = (playerName?: string) => {
    const nameToSearch = playerName || searchTerm
    
    if (!nameToSearch.trim()) {
      setError('Please enter a player name')
      return
    }

    const foundPlayer = allPlayers.find(player => 
      player.name.toLowerCase() === nameToSearch.toLowerCase()
    )

    if (foundPlayer) {
      setSelectedPlayer(foundPlayer)
      setSearchTerm(nameToSearch)
      setError(null)
    } else {
      setError('Player not found')
      setSelectedPlayer(null)
    }
    
    setShowSuggestions(false)
  }

  const handleComparisonSearch = (playerName?: string) => {
    const nameToSearch = playerName || comparisonSearchTerm
    
    if (!nameToSearch.trim()) return

    const foundPlayer = allPlayers.find(player => 
      player.name.toLowerCase() === nameToSearch.toLowerCase()
    )

    if (foundPlayer && comparisonPlayers.length < 2) {
      setComparisonPlayers([...comparisonPlayers, foundPlayer])
      setComparisonSearchTerm('')
      setError(null)
    }
    
    setShowComparisonSuggestions(false)
  }

  const startComparison = () => {
    if (selectedPlayer) {
      setComparisonPlayers([selectedPlayer])
      setIsComparing(true)
      setSelectedPlayer(null)
      setSearchTerm('')
    }
  }

  const exitComparison = () => {
    setIsComparing(false)
    setComparisonPlayers([])
    setComparisonSearchTerm('')
    setShowComparisonSuggestions(false)
  }

  const removeFromComparison = (playerToRemove: PlayerData) => {
    const remaining = comparisonPlayers.filter(p => p.name !== playerToRemove.name)
    setComparisonPlayers(remaining)
    
    if (remaining.length === 0) {
      exitComparison()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleComparisonKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleComparisonSearch()
    }
  }

  const handleSuggestionClick = (player: PlayerData) => {
    setSearchTerm(player.name)
    setSelectedPlayer(player)
    setShowSuggestions(false)
    setError(null)
  }

  const handleComparisonSuggestionClick = (player: PlayerData) => {
    setComparisonSearchTerm(player.name)
    handleComparisonSearch(player.name)
  }

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true)
    }
  }

  const handleInputBlur = () => {
    setTimeout(() => setShowSuggestions(false), 200)
  }

  const handleComparisonInputFocus = () => {
    if (comparisonSuggestions.length > 0) {
      setShowComparisonSuggestions(true)
    }
  }

  const handleComparisonInputBlur = () => {
    setTimeout(() => setShowComparisonSuggestions(false), 200)
  }

  // Component for rendering player comparison cards
  const PlayerComparisonCard = ({ player, onRemove }: { player: PlayerData, onRemove: () => void }) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-black">
      <div className="space-y-4">
        {/* Player Header */}
        <div className="border-b pb-4">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-xl font-bold text-black">{player.name}</h4>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-gray-600">
                  {player.position} - {player.raw_stats?.[0]?.proTeam || 'N/A'} - Rank #{player.position_rank}
                </p>
                {player.raw_stats?.[0]?.injuryStatus && (
                  <span className={`text-xs px-2 py-1 rounded ${getInjuryStatusColor(player.raw_stats[0].injuryStatus)}`}>
                    {player.raw_stats[0].injuryStatus}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-xs text-gray-600">Composite Score</p>
                <p className={`text-2xl font-bold ${getScoreColor(player.composite_score)}`}>
                  {player.composite_score.toFixed(3)}
                </p>
              </div>
              <button
                onClick={onRemove}
                className="text-red-500 hover:text-red-700 text-xl font-bold"
                title="Remove from comparison"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        {/* Performance Scores */}
        <div>
          <h5 className="font-medium text-base mb-2 text-black">Performance Breakdown</h5>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Production</p>
              <p className={`text-lg font-bold ${getScoreColor(player.production_score)}`}>
                {player.production_score.toFixed(3)}
              </p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Reliability</p>
              <p className={`text-lg font-bold ${getScoreColor(player.reliability_score)}`}>
                {player.reliability_score.toFixed(3)}
              </p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Sentiment</p>
              <p className={`text-lg font-bold ${getScoreColor(player.sentiment_score)}`}>
                {player.sentiment_score.toFixed(3)}
              </p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600">Value</p>
              <p className={`text-lg font-bold ${getScoreColor(player.value_score)}`}>
                {player.value_score.toFixed(3)}
              </p>
            </div>
          </div>
        </div>

        {/* Season Stats & Projections */}
        {player.raw_stats?.[0] && (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <h5 className="font-medium text-base mb-2 text-black">Season Stats</h5>
              <div className="space-y-2 bg-gray-50 p-3 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Points:</span>
                  <span className="font-semibold text-black">{player.raw_stats[0].total_points.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Avg Points:</span>
                  <span className="font-semibold text-black">{player.raw_stats[0].avg_points.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">% Owned:</span>
                  <span className="font-semibold text-black">{player.raw_stats[0].percent_owned.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">% Started:</span>
                  <span className="font-semibold text-black">{player.raw_stats[0].percent_started.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div>
              <h5 className="font-medium text-base mb-2 text-black">Projections</h5>
              <div className="space-y-2 bg-gray-50 p-3 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Projected Total:</span>
                  <span className="font-semibold text-black">{player.raw_stats[0].projected_total_points.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Projected Avg:</span>
                  <span className="font-semibold text-black">{player.raw_stats[0].projected_avg_points.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Simplified Sentiment Scores */}
        {typeof player.sentiment === 'object' && player.sentiment !== null && (
          <div>
            <h5 className="font-medium text-base mb-2 text-black">Sentiment Scores</h5>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">Reddit</p>
                <p className={`text-sm font-bold ${getSentimentColor(player.sentiment.reddit_sentiment_score)}`}>
                  {player.sentiment.reddit_sentiment_score}/10
                </p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">FantasyPros</p>
                <p className={`text-sm font-bold ${getSentimentColor(player.sentiment.fantasypros_sentiment_score)}`}>
                  {player.sentiment.fantasypros_sentiment_score}/10
                </p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded">
                <p className="text-xs text-gray-600">ESPN</p>
                <p className={`text-sm font-bold ${getSentimentColor(player.sentiment.espn_sentiment_score)}`}>
                  {player.sentiment.espn_sentiment_score}/10
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-black">
        {isComparing ? 'Player Comparison' : 'Player Lookup'}
      </h1>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-black">
        <h2 className="text-lg font-semibold mb-4 text-black">
          {isComparing ? 'Add Players to Compare' : 'Search for a Player'}
        </h2>
        
        {!isComparing ? (
          // Single player search
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={loading ? "Loading players..." : "Enter player name..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black disabled:bg-gray-100"
              />
              {showSuggestions && (
                <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="p-3 cursor-pointer hover:bg-blue-50 text-black border-b border-gray-100 last:border-b-0"
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      {suggestion.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={() => handleSearch()} disabled={loading}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>
        ) : (
          // Comparison mode search
          <div>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder={comparisonPlayers.length >= 2 ? "Maximum 2 players for comparison" : "Enter player name to add..."}
                  value={comparisonSearchTerm}
                  onChange={(e) => setComparisonSearchTerm(e.target.value)}
                  onKeyPress={handleComparisonKeyPress}
                  onFocus={handleComparisonInputFocus}
                  onBlur={handleComparisonInputBlur}
                  disabled={comparisonPlayers.length >= 2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black disabled:bg-gray-100"
                />
                {showComparisonSuggestions && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                    {comparisonSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="p-3 cursor-pointer hover:bg-blue-50 text-black border-b border-gray-100 last:border-b-0"
                        onClick={() => handleComparisonSuggestionClick(suggestion)}
                      >
                        {suggestion.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button 
                onClick={() => handleComparisonSearch()} 
                disabled={comparisonPlayers.length >= 2 || !comparisonSearchTerm.trim()}
              >
                Add Player
              </Button>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">
                {comparisonPlayers.length}/2 players selected
              </span>
              <Button 
                onClick={exitComparison}
                className="text-sm bg-gray-500 hover:bg-gray-600"
              >
                Exit Comparison
              </Button>
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-black">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-black">
            {isComparing ? 'Player Comparison' : 'Player Analysis'}
          </h3>
          {selectedPlayer && !isComparing && (
            <Button onClick={startComparison} className="bg-blue-600 hover:bg-blue-700">
              Compare Player
            </Button>
          )}
        </div>
        
        {loading && (
          <div className="text-center py-8">
            <p>Loading players...</p>
          </div>
        )}
        
        {error && (
          <div className="text-center py-8">
            <p className="text-red-600">{error}</p>
          </div>
        )}
        
        {!loading && !error && !selectedPlayer && !isComparing && (
          <p className="text-gray-600">No player selected. Use the search above to find a player.</p>
        )}

        {!loading && !error && isComparing && comparisonPlayers.length === 0 && (
          <p className="text-gray-600">No players selected for comparison. Add players using the search above.</p>
        )}

        {/* Comparison Mode */}
        {isComparing && comparisonPlayers.length > 0 && (
          <div className={`grid gap-6 ${comparisonPlayers.length === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
            {comparisonPlayers.map((player, index) => (
              <PlayerComparisonCard 
                key={index} 
                player={player} 
                onRemove={() => removeFromComparison(player)}
              />
            ))}
          </div>
        )}
        
        {/* Single Player Mode - keep existing detailed view */}
        {selectedPlayer && !isComparing && (
          <div className="space-y-6">
            {/* Player Header */}
            <div className="border-b pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-2xl font-bold text-black">{selectedPlayer.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-lg text-gray-600">
                      {selectedPlayer.position} - {selectedPlayer.raw_stats?.[0]?.proTeam || 'N/A'} - Rank #{selectedPlayer.position_rank}
                    </p>
                    {selectedPlayer.raw_stats?.[0]?.injuryStatus && (
                      <span className={`text-sm px-3 py-1 rounded ${getInjuryStatusColor(selectedPlayer.raw_stats[0].injuryStatus)}`}>
                        {selectedPlayer.raw_stats[0].injuryStatus}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Composite Score</p>
                  <p className={`text-3xl font-bold ${getScoreColor(selectedPlayer.composite_score)}`}>
                    {selectedPlayer.composite_score.toFixed(3)}
                  </p>
                </div>
              </div>
            </div>

            {/* Performance Scores */}
            <div>
              <h5 className="font-semibold text-lg mb-3 text-black">Performance Breakdown</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Production</p>
                  <p className={`text-xl font-bold ${getScoreColor(selectedPlayer.production_score)}`}>
                    {selectedPlayer.production_score.toFixed(3)}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Reliability</p>
                  <p className={`text-xl font-bold ${getScoreColor(selectedPlayer.reliability_score)}`}>
                    {selectedPlayer.reliability_score.toFixed(3)}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Sentiment</p>
                  <p className={`text-xl font-bold ${getScoreColor(selectedPlayer.sentiment_score)}`}>
                    {selectedPlayer.sentiment_score.toFixed(3)}
                  </p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Value</p>
                  <p className={`text-xl font-bold ${getScoreColor(selectedPlayer.value_score)}`}>
                    {selectedPlayer.value_score.toFixed(3)}
                  </p>
                </div>
              </div>
            </div>

            {/* Season Stats & Projections */}
            {selectedPlayer.raw_stats?.[0] && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h5 className="font-semibold text-lg mb-3 text-black">Season Stats</h5>
                  <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Points:</span>
                      <span className="font-semibold text-black">{selectedPlayer.raw_stats[0].total_points.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg Points:</span>
                      <span className="font-semibold text-black">{selectedPlayer.raw_stats[0].avg_points.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">% Owned:</span>
                      <span className="font-semibold text-black">{selectedPlayer.raw_stats[0].percent_owned.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">% Started:</span>
                      <span className="font-semibold text-black">{selectedPlayer.raw_stats[0].percent_started.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="font-semibold text-lg mb-3 text-black">Projections</h5>
                  <div className="space-y-3 bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Projected Total:</span>
                      <span className="font-semibold text-black">{selectedPlayer.raw_stats[0].projected_total_points.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Projected Avg:</span>
                      <span className="font-semibold text-black">{selectedPlayer.raw_stats[0].projected_avg_points.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Full Sentiment Analysis - only in single player mode */}
            {typeof selectedPlayer.sentiment === 'object' && selectedPlayer.sentiment !== null && (
              <div>
                <h5 className="font-semibold text-lg mb-3 text-black">What People Are Saying</h5>
                <div className="space-y-4">
                  {/* Reddit */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold text-black">Reddit</span>
                      <span className={`text-lg ${getSentimentColor(selectedPlayer.sentiment.reddit_sentiment_score)}`}>
                        {selectedPlayer.sentiment.reddit_sentiment_score}/10
                      </span>
                    </div>
                    <p className="text-gray-700">{selectedPlayer.sentiment.reddit_summary}</p>
                  </div>

                  {/* FantasyPros */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold text-black">FantasyPros</span>
                      <span className={`text-lg ${getSentimentColor(selectedPlayer.sentiment.fantasypros_sentiment_score)}`}>
                        {selectedPlayer.sentiment.fantasypros_sentiment_score}/10
                      </span>
                    </div>
                    <p className="text-gray-700">{selectedPlayer.sentiment.fantasypros_summary}</p>
                  </div>

                  {/* ESPN */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold text-black">ESPN</span>
                      <span className={`text-lg ${getSentimentColor(selectedPlayer.sentiment.espn_sentiment_score)}`}>
                        {selectedPlayer.sentiment.espn_sentiment_score}/10
                      </span>
                    </div>
                    <p className="text-gray-700">{selectedPlayer.sentiment.espn_summary}</p>
                  </div>

                  {/* Overall Summary */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-semibold text-black">Overall Assessment</span>
                      <span className={`text-lg ${getSentimentColor(selectedPlayer.sentiment.overall_sentiment_score)}`}>
                        {selectedPlayer.sentiment.overall_sentiment_score}/10
                      </span>
                    </div>
                    <p className="text-gray-700">{selectedPlayer.sentiment.overall_summary}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 