'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface LeagueContextType {
  leagueId: number | null;
  year: number | null;
  teamName: string | null;
  teamId: number | null;
  
  setLeagueParams: (params: {
    leagueId: number;
    year: number;
    teamName: string;
    teamId: number;
  }) => void;
  
  reset: () => void;
  hasLeagueParams: () => boolean;
}

const LeagueContext = createContext<LeagueContextType | undefined>(undefined);

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('ff-copilot-league');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setLeagueId(data.leagueId);
        setYear(data.year);
        setTeamName(data.teamName);
        setTeamId(data.teamId);
      } catch (e) {
        // Invalid JSON, ignore
      }
    }
  }, []);

  const setLeagueParams = (params: {
    leagueId: number;
    year: number;
    teamName: string;
    teamId: number;
  }) => {
    setLeagueId(params.leagueId);
    setYear(params.year);
    setTeamName(params.teamName);
    setTeamId(params.teamId);
    
    // Save to localStorage
    localStorage.setItem('ff-copilot-league', JSON.stringify(params));
  };

  const reset = () => {
    setLeagueId(null);
    setYear(null);
    setTeamName(null);
    setTeamId(null);
    
    // Clear from localStorage
    localStorage.removeItem('ff-copilot-league');
  };

  const hasLeagueParams = () => {
    return !!(leagueId && year && teamName && teamId);
  };

  const value = {
    leagueId,
    year,
    teamName,
    teamId,
    setLeagueParams,
    reset,
    hasLeagueParams
  };

  return (
    <LeagueContext.Provider value={value}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  const context = useContext(LeagueContext);
  if (context === undefined) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
}
