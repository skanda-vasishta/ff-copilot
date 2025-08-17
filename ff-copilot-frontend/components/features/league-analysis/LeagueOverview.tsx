import { Card, CardHeader, CardContent } from '@/components/ui/Card'

export function LeagueOverview() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">League Analysis</h1>
      
      {/* League Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">12</p>
              <p className="text-sm text-gray-600">Teams</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">0.850</p>
              <p className="text-sm text-gray-600">Avg Team Score</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">Week 14</p>
              <p className="text-sm text-gray-600">Current Week</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">2025</p>
              <p className="text-sm text-gray-600">Season</p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Team Standings */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Team Standings</h2>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4">Rank</th>
                  <th className="text-left py-3 px-4">Team</th>
                  <th className="text-left py-3 px-4">Overall Score</th>
                  <th className="text-left py-3 px-4">Starting Lineup</th>
                  <th className="text-left py-3 px-4">Bench Depth</th>
                  <th className="text-left py-3 px-4">Tier</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map((rank) => (
                  <tr key={rank} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">#{rank}</td>
                    <td className="py-3 px-4">Team Name {rank}</td>
                    <td className="py-3 px-4">0.000</td>
                    <td className="py-3 px-4">0.000</td>
                    <td className="py-3 px-4">0.000</td>
                    <td className="py-3 px-4">
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">A</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 