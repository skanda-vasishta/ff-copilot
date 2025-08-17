import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function FreeAgentRecommendations() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Free Agent Recommendations</h1>
      
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Filters</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All Positions</option>
              <option value="QB">QB</option>
              <option value="RB">RB</option>
              <option value="WR">WR</option>
              <option value="TE">TE</option>
              <option value="K">K</option>
              <option value="DST">D/ST</option>
            </select>
            
            <select className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="composite_score">Composite Score</option>
              <option value="production_score">Production Score</option>
              <option value="reliability_score">Reliability Score</option>
              <option value="sentiment_score">Sentiment Score</option>
            </select>
            
            <Button variant="outline">Auto-Detect Needs</Button>
            <Button>Get Recommendations</Button>
          </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Recommended Players Cards */}
        {[1, 2, 3, 4, 5, 6].map((index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-900">Free Agent {index}</h4>
                  <p className="text-sm text-gray-600">WR - BUF</p>
                </div>
                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                  Available
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Composite Score:</span>
                  <span className="text-sm font-medium">0.000</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">% Owned:</span>
                  <span className="text-sm font-medium">0%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Projected Points:</span>
                  <span className="text-sm font-medium">0.0</span>
                </div>
                <div className="mt-4">
                  <Button size="sm" className="w-full">
                    Add to Watchlist
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="text-center">
        <p className="text-gray-600">Showing 6 of 0 available free agents</p>
      </div>
    </div>
  )
} 