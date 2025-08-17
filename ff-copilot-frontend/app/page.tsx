import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">0.000</p>
                <p className="text-sm text-gray-600">Team Score</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">#0</p>
                <p className="text-sm text-gray-600">League Rank</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">0</p>
                <p className="text-sm text-gray-600">Recommended Moves</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">0</p>
                <p className="text-sm text-gray-600">Available FAs</p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Team Analysis</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                View detailed analysis of your team's performance and player evaluations.
              </p>
              <Link href="/team-analysis">
                <Button className="w-full">View Team Analysis</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Player Rankings</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Check comprehensive player rankings across all positions.
              </p>
              <Link href="/player-rankings">
                <Button className="w-full">View Rankings</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Free Agents</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Get personalized free agent recommendations for your team.
              </p>
              <Link href="/free-agents">
                <Button className="w-full">Find Free Agents</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Trade Tool</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Analyze potential trades to improve your team.
              </p>
              <Link href="/trade-tool">
                <Button className="w-full">Analyze Trades</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">League Analysis</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Compare your team against the entire league.
              </p>
              <Link href="/league-analysis">
                <Button className="w-full">View League Stats</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Player Lookup</h3>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
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
