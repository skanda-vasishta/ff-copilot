'use client';

import { Button } from '@/components/ui/Button';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthService } from '@/lib/auth';

export default function SignupForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    league_id: '',
    year: '2025',
    team_name: '',
    team_id: '',
    password: '',
  });
  const [teams, setTeams] = useState<[string, number][]>([]);
  const [errors, setErrors] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const { signup } = useAuth();

  // Fetch teams when league_id and year change
  useEffect(() => {
    const fetchTeams = async () => {
      if (formData.league_id && formData.year) {
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
        } finally {
          setLoadingTeams(false);
        }
      } else {
        setTeams([]);
      }
    };

    fetchTeams();
  }, [formData.league_id, formData.year]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});

    try {
      const selectedTeam = teams.find(team => team[0] === formData.team_name);
      if (!selectedTeam) {
        setErrors({ general: 'Please select a valid team' });
        return;
      }

      await signup(
        formData.name,
        formData.email,
        parseInt(formData.league_id),
        parseInt(formData.year),
        formData.team_name,
        selectedTeam[1], // team_id
        formData.password
      );
    } catch (error: any) {
      setErrors({ general: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="bg-white rounded-lg shadow-md">
      <form onSubmit={handleSubmit} className="px-6 py-8 space-y-6">
        <div>
          <label
            className="block text-sm font-medium text-black mb-2"
            htmlFor="name"
          >
            Full Name
          </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm text-black outline-2 placeholder:text-gray-500"
                id="name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your full name"
                required
              />
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          </div>

        <div>
          <label
            className="block text-sm font-medium text-black mb-2"
            htmlFor="email"
          >
            Email
          </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm text-black outline-2 placeholder:text-gray-500"
                id="email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="Enter your email address"
                required
              />
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
                />
              </svg>
            </div>
          </div>

        <div>
          <label
            className="block text-sm font-medium text-black mb-2"
            htmlFor="league_id"
          >
            League ID
          </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm text-black outline-2 placeholder:text-gray-500"
                id="league_id"
                type="number"
                name="league_id"
                value={formData.league_id}
                onChange={handleChange}
                placeholder="Enter your ESPN league ID"
                required
              />
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
          </div>

        <div>
          <label
            className="block text-sm font-medium text-black mb-2"
            htmlFor="year"
          >
            Year
          </label>
            <select
              className="block w-full rounded-md border border-gray-200 py-[9px] px-3 text-sm text-black outline-2"
              id="year"
              name="year"
              value={formData.year}
              onChange={handleChange}
              required
            >
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </select>
          </div>

        <div>
          <label
            className="block text-sm font-medium text-black mb-2"
            htmlFor="team_name"
          >
            Team
          </label>
            <select
              className="block w-full rounded-md border border-gray-200 py-[9px] px-3 text-sm text-black outline-2"
              id="team_name"
              name="team_name"
              value={formData.team_name}
              onChange={handleChange}
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

        <div>
          <label
            className="block text-sm font-medium text-black mb-2"
            htmlFor="password"
          >
            Password
          </label>
            <div className="relative">
              <input
                className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm text-black outline-2 placeholder:text-gray-500"
                id="password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter password (min 6 characters)"
                required
                minLength={6}
              />
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-500 peer-focus:text-gray-900"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1721 9z"
                />
              </svg>
            </div>
          </div>

        <div>
          <Button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </Button>
        </div>
        
        {errors.general && (
          <div className="text-sm text-red-500 text-center">
            {errors.general}
          </div>
        )}
        
        <div className="text-center">
          <p className="text-sm text-black">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-500 font-medium">
              Sign in here
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
