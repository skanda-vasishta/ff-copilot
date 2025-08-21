'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLeague } from '@/contexts/LeagueContext';

export function LeagueSetup() {
  const { leagueId, year, teamName, teamId, setLeagueParams, reset, hasLeagueParams } = useLeague();
  const [formData, setFormData] = useState({
    leagueId: '',
    year: '2025'
  });
  const [teams, setTeams] = useState<[string, number][]>([]);
  const [selectedTeamName, setSelectedTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear teams when league ID changes
    if (name === 'leagueId') {
      setTeams([]);
      setSelectedTeamName('');
    }
  };

  // Auto-fetch teams when both leagueId and year are provided
  useEffect(() => {
    const fetchTeamsAuto = async () => {
      if (formData.leagueId && formData.year && formData.leagueId.length >= 6) {
        setLoading(true);
        setError(null);
        
        try {
          const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
          const response = await fetch(`${API_BASE_URL}/get_teams_auth?league_id=${formData.leagueId}&year=${formData.year}`);
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch teams: ${response.status} - ${errorText}`);
          }
          
          const data = await response.json();
          setTeams(data.teams);
          setSelectedTeamName('');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to fetch teams');
          setTeams([]);
        } finally {
          setLoading(false);
        }
      } else {
        setTeams([]);
        setSelectedTeamName('');
      }
    };

    // Debounce the API call
    const timeoutId = setTimeout(fetchTeamsAuto, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.leagueId, formData.year]);



  const handleTeamSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTeamName(e.target.value);
  };

  const saveLeagueParams = () => {
    const selectedTeam = teams.find(team => team[0] === selectedTeamName);
    
    if (!selectedTeam) {
      setError('Please select a team');
      return;
    }

    setLeagueParams({
      leagueId: parseInt(formData.leagueId),
      year: parseInt(formData.year),
      teamName: selectedTeam[0],
      teamId: selectedTeam[1]
    });
  };

  // If context is already set, show current settings
  if (hasLeagueParams()) {
    return (
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-green-700">League Settings Configured</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="font-medium">League ID:</span> {leagueId}</div>
            <div><span className="font-medium">Year:</span> {year}</div>
            <div><span className="font-medium">Team:</span> {teamName}</div>
            <div><span className="font-medium">Team ID:</span> {teamId}</div>
          </div>
          <Button onClick={reset} variant="outline" className="w-full">
            Reset League Settings
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold">League Setup</h2>
        <p className="text-gray-600">Configure your league settings</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="leagueId" className="block text-sm font-medium text-gray-700 mb-1">
              League ID
            </label>
            <input
              type="number"
              id="leagueId"
              name="leagueId"
              value={formData.leagueId}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your ESPN league ID"
            />
          </div>
          
          <div>
            <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <input
              type="number"
              id="year"
              name="year"
              value={formData.year}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="2025"
            />
          </div>
        </div>

        {loading && (
          <div className="text-center text-gray-600">Loading teams...</div>
        )}

        {teams.length > 0 && (
          <div>
            <label htmlFor="teamSelect" className="block text-sm font-medium text-gray-700 mb-1">
              Select Your Team
            </label>
            <select
              id="teamSelect"
              value={selectedTeamName}
              onChange={handleTeamSelect}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose your team</option>
              {teams.map(([teamName, teamId]) => (
                <option key={teamId} value={teamName}>
                  {teamName}
                </option>
              ))}
            </select>
          </div>
        )}

        {selectedTeamName && (
          <Button onClick={saveLeagueParams} className="w-full">
            Save League Settings
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
