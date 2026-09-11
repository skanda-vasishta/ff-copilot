import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { refreshLeagueFromProvider } from '@/features/league/server/refresh'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const { leagueId } = await request.json() as { leagueId?: string }
    if (!leagueId) return NextResponse.json({ error: 'leagueId is required' }, { status: 400 })

    const supabase = await createClient()
    const [{ data: { user } }, { data: { session } }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ])
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: linked, error } = await supabase.from('user_leagues')
      .select('league:leagues(id,provider,external_id,season)')
      .eq('user_id', user.id)
      .eq('league_id', leagueId)
      .maybeSingle()
    if (error) throw error
    const league = linked?.league
    if (!league || Array.isArray(league)) return NextResponse.json({ error: 'League not found' }, { status: 404 })

    const refreshableLeague = league as unknown as { id: string; provider: 'espn' | 'sleeper'; external_id: string; season: number }
    const leagueRefresh = await refreshLeagueFromProvider(refreshableLeague)
    let nflverseRefresh: unknown = { status: 'unavailable' }
    if (session?.access_token) {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'
      try {
        const response = await fetch(`${apiBase}/v1/nflverse/refresh?season=${refreshableLeague.season}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(240_000),
        })
        nflverseRefresh = await response.json().catch(() => ({ status: 'failed' }))
        if (!response.ok) nflverseRefresh = { status: 'failed', detail: (nflverseRefresh as { detail?: string }).detail }
      } catch (error) {
        // League facts were refreshed successfully. Keep that useful result and
        // expose the independent global-data failure for status/diagnostics.
        nflverseRefresh = { status: 'failed', detail: error instanceof Error ? error.message : 'NFL data refresh failed' }
      }
    }
    return NextResponse.json({ ...leagueRefresh, nflverseRefresh })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not refresh league'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
