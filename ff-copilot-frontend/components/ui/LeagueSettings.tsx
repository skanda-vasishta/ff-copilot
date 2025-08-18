'use client';

import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthService } from '@/lib/auth';

export function LeagueSettings() {
  const { user, updateLeagueInfo } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    league_id: '',
    year: '2025',
    team_name: '',
    team_id: ''
  });
  const [teams, setTeams] = useState<[string, number][]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form data with current user info
  useEffect(() => {
    if (user) {
      setFormData({
        league_id: user.league_id?.toString() || '',
        year: user.year?.toString() || '2025',
        team_name: user.team_name || '',
        team_id: user.team_id?.toString() || ''
      });
    }
  }, [user]);

  // Fetch teams when league_id and year change
  useEffect(() => {
    const fetchTeams = async () => {
      if (formData.league_id && formData.year && isEditing) {
        setLoadingTeams(true);
        try {
          const response = await AuthService.getTeams(
            parseInt(formData.league_id), 
            parseInt(formData.year)
          );
          setTeams(response.teams);
          // Reset team selection when teams change
          setFormData(prev => ({ ...prev, team_name: '', team_id: '' }));
        } catch (error) {
          console.error('Failed to fetch teams:', error);
          setTeams([]);
          setError('Failed to fetch teams. Please check your league ID and year.');
        } finally {
          setLoadingTeams(false);
        }
      } else {
        setTeams([]);
      }
    };

    fetchTeams();
  }, [formData.league_id, formData.year, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'team_name') {
      // When team name is selected, also set the team_id
      const selectedTeam = teams.find(team => team[0] === value);
      setFormData(prev => ({
        ...prev,
        team_name: value,
        team_id: selectedTeam ? selectedTeam[1].toString() : ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
    setError(null);
  };

  const handleSave = () => {
    try {
      setError(null);
      
      // Debug: Log form data to see what we have
      console.log('Form data:', formData);
      console.log('Teams:', teams);
      
      // Validate required fields with specific error messages
      if (!formData.league_id) {
        setError('Please enter a League ID');
        return;
      }
      if (!formData.year) {
        setError('Please select a Year');
        return;
      }
      if (!formData.team_name) {
        setError('Please select a Team');
        return;
      }

      // Find the selected team to get both name and ID
      const selectedTeam = teams.find(team => team[0] === formData.team_name);
      if (!selectedTeam) {
        setError('Please select a valid team from the dropdown');
        return;
      }

      // Update the league info
      updateLeagueInfo(
        parseInt(formData.league_id),
        parseInt(formData.year),
        formData.team_name,
        selectedTeam[1] // team_id
      );

      setIsEditing(false);
      setError(null);
    } catch (error) {
      setError('Failed to update league information');
    }
  };

  const handleCancel = () => {
    // Reset form data to original values
    if (user) {
      setFormData({
        league_id: user.league_id?.toString() || '',
        year: user.year?.toString() || '2025',
        team_name: user.team_name || '',
        team_id: user.team_id?.toString() || ''
      });
    }
    setIsEditing(false);
    setError(null);
  };

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">League Settings</h2>
          {!isEditing && (
            <Button 
              onClick={() => setIsEditing(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
        
        {!isEditing ? (
          <div className="space-y-3">
            <div>
              <strong className="text-gray-700">League ID:</strong> {user.league_id}
            </div>
            <div>
              <strong className="text-gray-700">Year:</strong> {user.year}
            </div>
            <div>
              <strong className="text-gray-700">Team:</strong> {user.team_name} (ID: {user.team_id})
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                League ID
              </label>
              <input
                type="number"
                name="league_id"
                value={formData.league_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                placeholder="Enter your ESPN league ID"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Year
              </label>
              <select
                name="year"
                value={formData.year}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                required
              >
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Team
              </label>
              <select
                name="team_name"
                value={formData.team_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                required
                disabled={!teams.length || loadingTeams}
              >
                <option value="">
                  {loadingTeams ? 'Loading teams...' : teams.length > 0 ? 'Select your team' : 'Enter League ID first'}
                </option>
                {teams.map(([teamName, teamId]) => (
                  <option key={teamId} value={teamName}>
                    {teamName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleSave}
                disabled={loadingTeams || !formData.league_id || !formData.year || !formData.team_name}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Save Changes
              </Button>
              <Button
                onClick={handleCancel}
                className="bg-gray-500 hover:bg-gray-600 text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
