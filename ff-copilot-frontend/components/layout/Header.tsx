'use client';

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext';

export function Header() {
  const { user, logout, isAuthenticated } = useAuth();

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-blue-600">
              Fantasy Football Copilot
            </Link>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-8">
            <Link href="/team-analysis" className="text-gray-700 hover:text-blue-600">
              Team Analysis
            </Link>
            <Link href="/player-lookup" className="text-gray-700 hover:text-blue-600">
              Player Lookup
            </Link>
            <Link href="/player-rankings" className="text-gray-700 hover:text-blue-600">
              Rankings
            </Link>
            <Link href="/league-analysis" className="text-gray-700 hover:text-blue-600">
              League Analysis
            </Link>
            <Link href="/trade-tool" className="text-gray-700 hover:text-blue-600">
              Trade Tool
            </Link>
            <Link href="/free-agents" className="text-gray-700 hover:text-blue-600">
              Free Agents
            </Link>
          </nav>

          {/* Auth Section */}
          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <button
                onClick={logout}
                className="text-gray-700 hover:text-blue-600"
              >
                Sign Out
              </button>
            ) : (
              <>
                <Link href="/login" className="text-gray-700 hover:text-blue-600">
                  Login
                </Link>
                <Link href="/signup" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}