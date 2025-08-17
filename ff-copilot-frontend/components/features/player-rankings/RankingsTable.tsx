import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function RankingsTable() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Player Rankings</h1>
      
      <div className="flex gap-4 mb-6">
        <select className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Positions</option>
          <option value="QB">Quarterbacks</option>
          <option value="RB">Running Backs</option>
          <option value="WR">Wide Receivers</option>
          <option value="TE">Tight Ends</option>
          <option value="K">Kickers</option>
          <option value="DST">Defense/ST</option>
        </select>
        
        <select className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="composite_score">Composite Score</option>
          <option value="production_score">Production Score</option>
          <option value="reliability_score">Reliability Score</option>
          <option value="sentiment_score">Sentiment Score</option>
        </select>
        
        <Button variant="outline">Export</Button>
      </div>
      
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Rankings - All Positions</h2>
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
                  <th className="text-left py-3 px-4">Composite Score</th>
                  <th className="text-left py-3 px-4">Production</th>
                  <th className="text-left py-3 px-4">Reliability</th>
                  <th className="text-left py-3 px-4">Sentiment</th>
                </tr>
              </thead>
              <tbody>
                {/* Placeholder rows */}
                {[1, 2, 3, 4, 5].map((rank) => (
                  <tr key={rank} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium">#{rank}</td>
                    <td className="py-3 px-4">Player Name {rank}</td>
                    <td className="py-3 px-4">QB</td>
                    <td className="py-3 px-4">BUF</td>
                    <td className="py-3 px-4">0.000</td>
                    <td className="py-3 px-4">0.000</td>
                    <td className="py-3 px-4">0.000</td>
                    <td className="py-3 px-4">0.000</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 text-center">
            <p className="text-gray-600">Showing 5 of 0 players</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 