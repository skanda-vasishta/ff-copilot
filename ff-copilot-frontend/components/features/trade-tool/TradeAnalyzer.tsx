import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function TradeAnalyzer() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Trade Tool</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team 1 */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Team 1</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select Team 1</option>
                <option value="team1">FC Skanda</option>
                <option value="team2">Team Venkat</option>
                {/* Add more teams */}
              </select>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Players to Trade Away:
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Player name..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button size="sm">Add</Button>
                  </div>
                  <div className="text-sm text-gray-600">
                    No players selected
                  </div>
                </div>
              </div>
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
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select Team 2</option>
                <option value="team1">FC Skanda</option>
                <option value="team2">Team Venkat</option>
                {/* Add more teams */}
              </select>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Players to Trade Away:
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Player name..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button size="sm">Add</Button>
                  </div>
                  <div className="text-sm text-gray-600">
                    No players selected
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Analyze Button */}
      <div className="text-center">
        <Button size="lg">Analyze Trade</Button>
      </div>
      
      {/* Trade Results */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Trade Analysis Results</h3>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">Set up a trade above and click "Analyze Trade" to see the results.</p>
        </CardContent>
      </Card>
    </div>
  )
} 