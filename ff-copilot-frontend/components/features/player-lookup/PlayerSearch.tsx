import { Button } from '@/components/ui/Button'

export function PlayerSearch() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Player Lookup</h1>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Search for a Player</h2>
        
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Enter player name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button>Search</Button>
        </div>
        
        <div className="mt-4 flex gap-2">
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
            <option value="">All Teams</option>
            <option value="BUF">Buffalo</option>
            <option value="MIA">Miami</option>
            {/* Add more teams */}
          </select>
        </div>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold mb-4">Search Results</h3>
        <p className="text-gray-600">No player selected. Use the search above to find a player.</p>
      </div>
    </div>
  )
} 