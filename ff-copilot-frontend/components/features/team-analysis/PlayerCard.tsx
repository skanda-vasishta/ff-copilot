'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { useState } from 'react'

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

interface PlayerCardProps {
  player: PlayerData
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

export function PlayerCard({ player }: PlayerCardProps) {
  const [expanded, setExpanded] = useState(false)

  const hasSentimentData = typeof player.sentiment === 'object' && player.sentiment !== null
  const rawStats = player.raw_stats?.[0] // Get the first (and likely only) raw stats entry

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex justify-between items-center">
          <div>
            <h4 className="font-semibold text-lg text-black">
              {player.name}
            </h4>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-600">
                {player.position} - {rawStats?.proTeam || 'N/A'} - Rank #{player.position_rank}
              </p>
              {rawStats?.injuryStatus && (
                <span className={`text-xs px-2 py-1 rounded ${getInjuryStatusColor(rawStats.injuryStatus)}`}>
                  {rawStats.injuryStatus}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-lg ${getScoreColor(player.composite_score)}`}>
              {player.composite_score.toFixed(3)}
            </span>
            <span className="text-sm text-gray-500">
              {expanded ? '▼' : '▶'}
            </span>
          </div>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent>
          <div className="space-y-4">
            {/* Performance Scores */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Production:</span>
                  <span className={`text-sm ${getScoreColor(player.production_score)}`}>
                    {player.production_score.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Reliability:</span>
                  <span className={`text-sm ${getScoreColor(player.reliability_score)}`}>
                    {player.reliability_score.toFixed(3)}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Sentiment:</span>
                  <span className={`text-sm ${getScoreColor(player.sentiment_score)}`}>
                    {player.sentiment_score.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Value:</span>
                  <span className={`text-sm ${getScoreColor(player.value_score)}`}>
                    {player.value_score.toFixed(3)}
                  </span>
                </div>
              </div>
            </div>

            {/* Season Stats */}
            {rawStats && (
              <div className="border-t pt-4">
                <h5 className="font-medium text-black mb-3">Season Stats</h5>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Total Points:</span>
                      <span className="text-sm font-medium text-black">{rawStats.total_points.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Avg Points:</span>
                      <span className="text-sm font-medium text-black">{rawStats.avg_points.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">% Owned:</span>
                      <span className="text-sm font-medium text-black">{rawStats.percent_owned.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">% Started:</span>
                      <span className="text-sm font-medium text-black">{rawStats.percent_started.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Projections */}
            {rawStats && (
              <div className="border-t pt-4">
                <h5 className="font-medium text-black mb-3">Projections</h5>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Projected Total:</span>
                      <span className="text-sm font-medium text-black">{rawStats.projected_total_points.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Projected Avg:</span>
                      <span className="text-sm font-medium text-black">{rawStats.projected_avg_points.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sentiment Analysis */}
            {hasSentimentData && typeof player.sentiment === 'object' && (
              <div className="border-t pt-4">
                <h5 className="font-medium text-black mb-3">What People Are Saying</h5>
                <div className="space-y-3">
                  {/* Reddit */}
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-sm text-black">Reddit</span>
                      <span className={`text-sm ${getSentimentColor(player.sentiment.reddit_sentiment_score)}`}>
                        {player.sentiment.reddit_sentiment_score}/10
                      </span>
                    </div>
                    <p className="text-xs text-gray-700">{player.sentiment.reddit_summary}</p>
                  </div>

                  {/* FantasyPros */}
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-sm text-black">FantasyPros</span>
                      <span className={`text-sm ${getSentimentColor(player.sentiment.fantasypros_sentiment_score)}`}>
                        {player.sentiment.fantasypros_sentiment_score}/10
                      </span>
                    </div>
                    <p className="text-xs text-gray-700">{player.sentiment.fantasypros_summary}</p>
                  </div>

                  {/* ESPN */}
                  <div className="bg-gray-50 p-3 rounded">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-sm text-black">ESPN</span>
                      <span className={`text-sm ${getSentimentColor(player.sentiment.espn_sentiment_score)}`}>
                        {player.sentiment.espn_sentiment_score}/10
                      </span>
                    </div>
                    <p className="text-xs text-gray-700">{player.sentiment.espn_summary}</p>
                  </div>

                  {/* Overall Summary */}
                  <div className="bg-blue-50 p-3 rounded border border-blue-200">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-sm text-black">Overall</span>
                      <span className={`text-sm ${getSentimentColor(player.sentiment.overall_sentiment_score)}`}>
                        {player.sentiment.overall_sentiment_score}/10
                      </span>
                    </div>
                    <p className="text-xs text-gray-700">{player.sentiment.overall_summary}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  )
} 