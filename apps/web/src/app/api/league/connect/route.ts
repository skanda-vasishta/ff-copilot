import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { connectLeagueFromProvider, type Provider } from '@/features/league/server/refresh'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const input = await request.json() as { provider?: Provider; externalId?: string; season?: number }
    if (!input.externalId || !['espn', 'sleeper'].includes(input.provider ?? '') || !Number.isInteger(input.season)) {
      return NextResponse.json({ error: 'A valid provider, league ID, and season are required' }, { status: 400 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const league = await connectLeagueFromProvider(user.id, {
      provider: input.provider!, externalId: input.externalId.trim(), season: input.season!,
    })
    return NextResponse.json({ state: 'available', league }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not connect league' }, { status: 502 })
  }
}
