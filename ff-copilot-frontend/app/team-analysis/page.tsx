'use client'

import { TeamOverview } from '@/components/features/team-analysis/TeamOverview'
import { PlayerCard } from '@/components/features/team-analysis/PlayerCard'
import { useEffect, useState } from 'react'

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

export default function TeamAnalysisPage() {
  const [rosterData, setRosterData] = useState<PlayerData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchRoster = async () => {
      try {
        const response = await fetch('http://localhost:8000/get_team_roster?league_id=600021088&year=2025&team_name=FC%20Skanda&team_id=1')
        if (!response.ok) {
          throw new Error('Failed to fetch roster data')
        }
        const data = await response.json()
        setRosterData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchRoster()
  }, [])

  return (
    <div className="container mx-auto px-4 py-8">
      <TeamOverview />
      
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-6 text-black">Your Players</h2>
        {loading && (
          <div className="text-center py-8">Loading roster...</div>
        )}
        {error && (
          <div className="text-center py-8 text-red-600">Error: {error}</div>
        )}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
            {rosterData.map((player, index) => (
              <PlayerCard key={index} player={player} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 