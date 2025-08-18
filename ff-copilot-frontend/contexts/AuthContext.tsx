'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AuthService, User } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, league_id: number, year: number, team_name: string, team_id: number, password: string) => Promise<void>;
  logout: () => void;
  updateLeagueInfo: (league_id: number, year: number, team_name: string, team_id: number) => void;
  isAuthenticated: boolean;
  hasSelectedLeague: boolean;
  // League parameters for API calls
  leagueId: number | null;
  year: number | null;
  teamName: string | null;
  teamId: number | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const publicRoutes = ['/login', '/signup'];
  const isPublicRoute = publicRoutes.includes(pathname);

  useEffect(() => {
    // Check if user is logged in on mount
    const currentUser = AuthService.getUser();
    if (currentUser) {
      setUser(currentUser);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Redirect logic
    if (!isLoading) {
      if (!user && !isPublicRoute) {
        // Not authenticated and trying to access protected route
        router.push('/login');
      } else if (user && isPublicRoute) {
        // Authenticated but on public route
        router.push('/');
      } else if (user && !user.league_id && pathname !== '/select-league') {
        // Authenticated but no league selected
        router.push('/select-league');
      }
    }
  }, [user, isLoading, isPublicRoute, router, pathname]);

  const login = async (email: string, password: string) => {
    try {
      const response = await AuthService.login({ email, password });
      setUser(response.user);
      
      // Redirect based on league selection
      if (response.user.league_id) {
        router.push('/');
      } else {
        router.push('/select-league');
      }
    } catch (error) {
      throw error; // Re-throw to be handled by the component
    }
  };

  const signup = async (name: string, email: string, league_id: number, year: number, team_name: string, team_id: number, password: string) => {
    try {
      const response = await AuthService.signup({ name, email, league_id, year, team_name, team_id, password });
      setUser(response.user);
      
      // Redirect based on league selection
      if (response.user.league_id) {
        router.push('/');
      } else {
        router.push('/select-league');
      }
    } catch (error) {
      throw error; // Re-throw to be handled by the component
    }
  };

  const logout = () => {
    AuthService.logout();
    setUser(null);
    router.push('/login');
  };

  const updateLeagueInfo = (league_id: number, year: number, team_name: string, team_id: number) => {
    if (user) {
      const updatedUser = {
        ...user,
        league_id,
        year,
        team_name,
        team_id
      };
      setUser(updatedUser);
      // Update localStorage as well
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  const value = {
    user,
    isLoading,
    login,
    signup,
    logout,
    updateLeagueInfo,
    isAuthenticated: !!user,
    hasSelectedLeague: !!user?.league_id,
    // League parameters for API calls
    leagueId: user?.league_id || null,
    year: user?.year || null,
    teamName: user?.team_name || null,
    teamId: user?.team_id || null,
  };

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
