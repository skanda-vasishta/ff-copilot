'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';

export default function SelectLeaguePage() {
  const [leagueId, setLeagueId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { user, logout } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Update user's league_id
      if (user) {
        const updatedUser = { ...user, league_id: parseInt(leagueId) };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        window.location.href = '/'; // Force reload to update context
      }
    } catch (error: any) {
      setError('Failed to update league selection');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex items-center justify-center md:h-screen">
      <div className="relative mx-auto flex w-full max-w-[400px] flex-col space-y-2.5 p-4 md:-mt-32">
        <div className="flex h-20 w-full items-end rounded-lg bg-blue-500 p-3 md:h-36">
          <div className="w-32 text-white md:w-36">
            <h1 className="text-2xl font-bold">Fantasy Football Copilot</h1>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex-1 rounded-lg bg-gray-50 px-6 pb-4 pt-8">
            <h1 className="mb-3 text-2xl font-semibold text-black">
              Select Your League
            </h1>
            <p className="mb-4 text-sm text-black">
              Welcome, {user?.name}! Please enter your ESPN Fantasy Football League ID to continue.
            </p>
            
            <div className="w-full">
              <div>
                <label
                  className="mb-3 mt-5 block text-xs font-medium text-black"
                  htmlFor="league_id"
                >
                  ESPN League ID
                </label>
                <div className="relative">
                  <input
                    className="peer block w-full rounded-md border border-gray-200 py-[9px] pl-10 text-sm text-black outline-2 placeholder:text-gray-500"
                    id="league_id"
                    type="number"
                    value={leagueId}
                    onChange={(e) => setLeagueId(e.target.value)}
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
            </div>

            <Button className="mt-4 w-full" disabled={isLoading || !leagueId}>
              {isLoading ? 'Saving...' : 'Continue to Fantasy Tools'}
              <svg
                className="ml-auto h-5 w-5 text-gray-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Button>

            {error && (
              <div className="flex h-8 items-end space-x-1 mt-4">
                <svg
                  className="h-5 w-5 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={logout}
                className="text-sm text-black hover:text-blue-600"
              >
                Sign out
              </button>
            </div>

            <div className="mt-4 text-sm text-black bg-blue-50 p-3 rounded">
              <p className="font-medium text-blue-800">Need help finding your League ID?</p>
              <p className="text-black">1. Go to your ESPN Fantasy Football league</p>
              <p className="text-black">2. Look in the URL: espn.com/fantasy/football/league?leagueId=<strong>YOUR_ID</strong></p>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
