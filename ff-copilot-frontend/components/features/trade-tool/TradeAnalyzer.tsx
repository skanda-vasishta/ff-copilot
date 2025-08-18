'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface Team {
  name: string
  id: number
}

interface Player {
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
    projected_total_points: number
    projected_avg_points: number
    [key: string]: any
  }>
}

interface TradeResults {
  [teamName: string]: {
    [metric: string]: number
  }
}

export function TradeAnalyzer() {
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam1, setSelectedTeam1] = useState<Team | null>(null)
  const [selectedTeam2, setSelectedTeam2] = useState<Team | null>(null)
  const [team1Roster, setTeam1Roster] = useState<Player[]>([])
  const [team2Roster, setTeam2Roster] = useState<Player[]>([])
  const [team1Outgoing, setTeam1Outgoing] = useState<string[]>([])
  const [team2Outgoing, setTeam2Outgoing] = useState<string[]>([])
  const [tradeResults, setTradeResults] = useState<TradeResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get league parameters from auth context
  const { leagueId, year, teamName, teamId } = useAuth()

  const leagueParams = {
    league_id: leagueId,
    year: year,
    team_name: teamName,
    team_id: teamId
  }

  useEffect(() => {
    fetchTeams()
  }, [leagueId, year, teamName, teamId])

  useEffect(() => {
    setTeam1Outgoing([]) // Clear selected players when team changes
    if (selectedTeam1) {
      fetchTeamRoster(selectedTeam1, setTeam1Roster)
    } else {
      setTeam1Roster([])
    }
  }, [selectedTeam1])

  useEffect(() => {
    setTeam2Outgoing([]) // Clear selected players when team changes
    if (selectedTeam2) {
      fetchTeamRoster(selectedTeam2, setTeam2Roster)
    } else {
      setTeam2Roster([])
    }
  }, [selectedTeam2])

  const fetchTeams = async () => {
    try {
      // Check if we have the required league parameters
      if (!leagueId || !year || !teamName || !teamId) {
        throw new Error('League information not available. Please ensure you are logged in and have selected a league.')
      }

      const params = new URLSearchParams(leagueParams as any)
      const response = await fetch(`http://localhost:8000/get_all_team_names?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch teams')
      }
      
      const data = await response.json()
      const teamsList = data.team_names.map((team: [string, number]) => ({
        name: team[0],
        id: team[1]
      }))
      setTeams(teamsList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch teams')
    }
  }

  const fetchTeamRoster = async (team: Team, setRoster: (roster: Player[]) => void) => {
    try {
      const params = new URLSearchParams({
        ...leagueParams,
        team_name: team.name,
        team_id: team.id.toString()
      } as any)
      
      const response = await fetch(`http://localhost:8000/get_team_roster?${params}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch roster for ${team.name}`)
      }
      
      const data = await response.json()
      setRoster(data)
    } catch (err) {
      console.error(`Error fetching roster for ${team.name}:`, err)
      setRoster([])
    }
  }

  const handleTeam1Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teamId = parseInt(e.target.value)
    const team = teams.find(t => t.id === teamId)
    setSelectedTeam1(team || null)
    setTradeResults(null)
  }

  const handleTeam2Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const teamId = parseInt(e.target.value)
    const team = teams.find(t => t.id === teamId)
    setSelectedTeam2(team || null)
    setTradeResults(null)
  }

  const addPlayerToTrade = (player: string, team: 1 | 2) => {
    if (team === 1 && !team1Outgoing.includes(player)) {
      setTeam1Outgoing([...team1Outgoing, player])
    } else if (team === 2 && !team2Outgoing.includes(player)) {
      setTeam2Outgoing([...team2Outgoing, player])
    }
    setTradeResults(null)
  }

  const removePlayerFromTrade = (player: string, team: 1 | 2) => {
    if (team === 1) {
      setTeam1Outgoing(team1Outgoing.filter(p => p !== player))
    } else {
      setTeam2Outgoing(team2Outgoing.filter(p => p !== player))
    }
    setTradeResults(null)
  }

  const analyzeTrade = async () => {
    if (!selectedTeam1 || !selectedTeam2) {
      setError('Please select both teams')
      return
    }

    if (team1Outgoing.length === 0 || team2Outgoing.length === 0) {
      setError('Both teams must trade at least one player')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        ...leagueParams,
        team1_name: selectedTeam1.name,
        team2_name: selectedTeam2.name
      } as any)

      // Add outgoing players as query parameters
      team1Outgoing.forEach(player => {
        params.append('team1_outgoing', player)
      })
      team2Outgoing.forEach(player => {
        params.append('team2_outgoing', player)
      })

      const response = await fetch(`http://localhost:8000/evaluate_trade?${params}`)

      if (!response.ok) {
        throw new Error('Failed to evaluate trade')
      }

      const data = await response.json()
      setTradeResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze trade')
    } finally {
      setLoading(false)
    }
  }

  const formatScore = (score: number): string => {
    return score > 0 ? `+${score.toFixed(3)}` : score.toFixed(3)
  }

  const getScoreColor = (score: number): string => {
    if (score > 0) return 'text-green-600'
    if (score < 0) return 'text-red-600'
    return 'text-gray-600'
  }

  const getPlayersByPosition = (roster: Player[]) => {
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST']
    return positions.reduce((acc, pos) => {
      acc[pos] = roster.filter(p => p.position === pos)
      return acc
    }, {} as Record<string, Player[]>)
  }

  const PlayerSelector = ({ 
    team, 
    roster, 
    outgoingPlayers, 
    onAddPlayer, 
    onRemovePlayer 
  }: {
    team: Team
    roster: Player[]
    outgoingPlayers: string[]
    onAddPlayer: (player: string) => void
    onRemovePlayer: (player: string) => void
  }) => {
    const playersByPosition = getPlayersByPosition(roster)

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Players to Trade Away:
          </label>
          
          {/* Selected players */}
          {outgoingPlayers.length > 0 && (
            <div className="mb-3 space-y-1">
              {outgoingPlayers.map(player => (
                <div key={player} className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded">
                  <span className="text-sm font-medium">{player}</span>
                  <button
                    onClick={() => onRemovePlayer(player)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Available players by position */}
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {Object.entries(playersByPosition).map(([position, players]) => (
              players.length > 0 && (
                <div key={position}>
                  <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    {position}
                  </h4>
                  <div className="space-y-1">
                    {players.map(player => (
                      <div key={player.name} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded text-sm">
                        <div className="flex-1">
                          <span className="font-medium">{player.name}</span>
                          <span className="text-gray-500 ml-2">({player.composite_score.toFixed(3)})</span>
                        </div>
                        {!outgoingPlayers.includes(player.name) && (
                          <button
                            onClick={() => onAddPlayer(player.name)}
                            className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 bg-blue-100 rounded"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>

          {outgoingPlayers.length === 0 && (
            <div className="text-sm text-gray-600 text-center py-4">
              No players selected for trade
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Trade Tool</h1>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team 1 */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Team 1</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                value={selectedTeam1?.id || ''}
                onChange={handleTeam1Change}
              >
                <option value="">Select Team 1</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              
              {selectedTeam1 && team1Roster.length > 0 && (
                <PlayerSelector
                  team={selectedTeam1}
                  roster={team1Roster}
                  outgoingPlayers={team1Outgoing}
                  onAddPlayer={(player) => addPlayerToTrade(player, 1)}
                  onRemovePlayer={(player) => removePlayerFromTrade(player, 1)}
                />
              )}

              {selectedTeam1 && team1Roster.length === 0 && (
                <div className="text-sm text-gray-600 text-center py-4">
                  Loading roster...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Team 2 */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Team 2</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                value={selectedTeam2?.id || ''}
                onChange={handleTeam2Change}
              >
                <option value="">Select Team 2</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              
              {selectedTeam2 && team2Roster.length > 0 && (
                <PlayerSelector
                  team={selectedTeam2}
                  roster={team2Roster}
                  outgoingPlayers={team2Outgoing}
                  onAddPlayer={(player) => addPlayerToTrade(player, 2)}
                  onRemovePlayer={(player) => removePlayerFromTrade(player, 2)}
                />
              )}

              {selectedTeam2 && team2Roster.length === 0 && (
                <div className="text-sm text-gray-600 text-center py-4">
                  Loading roster...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Analyze Button */}
      <div className="text-center">
        <Button 
          onClick={analyzeTrade}
          disabled={loading || !selectedTeam1 || !selectedTeam2 || team1Outgoing.length === 0 || team2Outgoing.length === 0}
          className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3"
        >
          {loading ? 'Analyzing...' : 'Analyze Trade'}
        </Button>
      </div>
      
      {/* Trade Results */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Trade Analysis Results</h3>
        </CardHeader>
        <CardContent>
          {!tradeResults ? (
            <p className="text-gray-600">Set up a trade above and click "Analyze Trade" to see the results.</p>
          ) : (
            <div className="space-y-6">
              {/* Trade Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedTeam1 && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-lg mb-3">{selectedTeam1.name}</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm text-gray-600">Trading Away:</span>
                        <div className="mt-1">
                          {team1Outgoing.map(player => (
                            <span key={player} className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded mr-1 mb-1">
                              {player}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">Receiving:</span>
                        <div className="mt-1">
                          {team2Outgoing.map(player => (
                            <span key={player} className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded mr-1 mb-1">
                              {player}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedTeam2 && (
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-lg mb-3">{selectedTeam2.name}</h4>
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm text-gray-600">Trading Away:</span>
                        <div className="mt-1">
                          {team2Outgoing.map(player => (
                            <span key={player} className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded mr-1 mb-1">
                              {player}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-gray-600">Receiving:</span>
                        <div className="mt-1">
                          {team1Outgoing.map(player => (
                            <span key={player} className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded mr-1 mb-1">
                              {player}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Score Changes */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4">Team</th>
                      <th className="text-left py-3 px-4">Overall Score Change</th>
                      <th className="text-left py-3 px-4">Starting QB</th>
                      <th className="text-left py-3 px-4">Starting RB</th>
                      <th className="text-left py-3 px-4">Starting WR</th>
                      <th className="text-left py-3 px-4">Starting TE</th>
                      <th className="text-left py-3 px-4">Bench Depth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(tradeResults).map(([teamName, changes]) => (
                      <tr key={teamName} className="border-b border-gray-100">
                        <td className="py-3 px-4 font-medium">{teamName}</td>
                        <td className={`py-3 px-4 font-bold ${getScoreColor(changes.overall_score || 0)}`}>
                          {formatScore(changes.overall_score || 0)}
                        </td>
                        <td className={`py-3 px-4 ${getScoreColor(changes.starting_qbs_score || 0)}`}>
                          {changes.starting_qbs_score ? formatScore(changes.starting_qbs_score) : '0.000'}
                        </td>
                        <td className={`py-3 px-4 ${getScoreColor(changes.starting_rb_score || 0)}`}>
                          {changes.starting_rb_score ? formatScore(changes.starting_rb_score) : '0.000'}
                        </td>
                        <td className={`py-3 px-4 ${getScoreColor(changes.starting_wr_score || 0)}`}>
                          {changes.starting_wr_score ? formatScore(changes.starting_wr_score) : '0.000'}
                        </td>
                        <td className={`py-3 px-4 ${getScoreColor(changes.starting_te_score || 0)}`}>
                          {changes.starting_te_score ? formatScore(changes.starting_te_score) : '0.000'}
                        </td>
                        <td className={`py-3 px-4 ${getScoreColor((changes.bench_qbs_score || 0) + (changes.bench_rb_score || 0) + (changes.bench_wr_score || 0) + (changes.bench_te_score || 0))}`}>
                          {formatScore((changes.bench_qbs_score || 0) + (changes.bench_rb_score || 0) + (changes.bench_wr_score || 0) + (changes.bench_te_score || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Trade Winner */}
              <div className="text-center">
                {(() => {
                  const teamNames = Object.keys(tradeResults)
                  if (teamNames.length === 2) {
                    const team1Change = tradeResults[teamNames[0]].overall_score || 0
                    const team2Change = tradeResults[teamNames[1]].overall_score || 0
                    const winner = team1Change > team2Change ? teamNames[0] : teamNames[1]
                    const winnerGain = Math.max(team1Change, team2Change)
                    
                    return (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="font-semibold text-lg mb-2">Trade Winner</h4>
                        <p className="text-xl font-bold text-blue-600">
                          {winner} (+{winnerGain.toFixed(3)})
                        </p>
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 