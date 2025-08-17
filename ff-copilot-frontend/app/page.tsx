'use client';

import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

export default function HomePage() {
  const { user, isAuthenticated } = useAuth();
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Fantasy Football Copilot</h1>
        
        {/* Welcome Section */}
        {isAuthenticated && user ? (
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Welcome back, {user.name}!</h2>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 text-lg leading-relaxed">
                <strong>League:</strong> {user.league_id} ({user.year})
              </p>
              <p className="text-gray-700 text-lg leading-relaxed">
                <strong>Team:</strong> {user.team_name} (ID: {user.team_id})
              </p>
              <p className="text-gray-600 mt-2">
                Choose from the tools below to analyze your team, find trades, or discover free agents.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">About</h2>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 text-lg leading-relaxed">
                This is a fantasy football copilot built to help you navigate the wonderful world of fantasy football, 
                compiling numerous sources from the internet for player analysis and providing the following suite of tools:
              </p>
            </CardContent>
          </Card>
        )}
        
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="flex flex-col h-full">
            <CardHeader>
              <h3 className="text-lg font-semibold">Team Analysis</h3>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <p className="text-gray-600 mb-4 flex-grow">
                View detailed analysis of your team's performance and player evaluations.
              </p>
              <Link href="/team-analysis">
                <Button className="w-full">View Team Analysis</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="flex flex-col h-full">
            <CardHeader>
              <h3 className="text-lg font-semibold">Player Rankings</h3>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <p className="text-gray-600 mb-4 flex-grow">
                Check comprehensive player rankings across all positions.
              </p>
              <Link href="/player-rankings">
                <Button className="w-full">View Rankings</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="flex flex-col h-full">
            <CardHeader>
              <h3 className="text-lg font-semibold">Free Agents</h3>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <p className="text-gray-600 mb-4 flex-grow">
                Get personalized free agent recommendations for your team.
              </p>
              <Link href="/free-agents">
                <Button className="w-full">Find Free Agents</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="flex flex-col h-full">
            <CardHeader>
              <h3 className="text-lg font-semibold">Trade Tool</h3>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <p className="text-gray-600 mb-4 flex-grow">
                Analyze potential trades to improve your team.
              </p>
              <Link href="/trade-tool">
                <Button className="w-full">Analyze Trades</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="flex flex-col h-full">
            <CardHeader>
              <h3 className="text-lg font-semibold">League Analysis</h3>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <p className="text-gray-600 mb-4 flex-grow">
                Compare your team against the entire league.
              </p>
              <Link href="/league-analysis">
                <Button className="w-full">View League Stats</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="flex flex-col h-full">
            <CardHeader>
              <h3 className="text-lg font-semibold">Player Lookup</h3>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <p className="text-gray-600 mb-4 flex-grow">
                Search for any player and view their detailed stats.
              </p>
              <Link href="/player-lookup">
                <Button className="w-full">Search Players</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
