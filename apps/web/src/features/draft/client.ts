import { createClient } from '@/lib/supabase/client'
import type { AgentThread } from '@ff-copilot/agent-runtime'
import type { DraftSession, DraftState } from './types'

export async function listDraftSessions(leagueId: string) {
  const { data, error } = await createClient().from('draft_sessions').select('*').eq('league_id', leagueId).order('updated_at', { ascending: false })
  if (error) throw error
  return data as DraftSession[]
}

export async function renameDraftSession(id: string, name: string) {
  const value = name.trim()
  if (!value) throw new Error('Draft name is required')
  const { data, error } = await createClient().from('draft_sessions').update({ name: value, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('A draft with that name already exists')
    throw error
  }
  return data as DraftSession
}

export async function createDraftSession(input: { leagueId: string; selectedTeamId: string; season: number; name: string; draftType: 'snake' | 'linear'; teamOrder: string[]; roundCount: number }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must sign in')
  const { data: session, error } = await supabase.from('draft_sessions').insert({
    user_id: user.id, league_id: input.leagueId, selected_team_id: input.selectedTeamId, season: input.season,
    name: input.name, draft_type: input.draftType, team_order: input.teamOrder, round_count: input.roundCount,
  }).select().single()
  if (error || !session) {
    if (error?.code === '23505') throw new Error('A draft with that name already exists')
    throw error || new Error('Could not create draft')
  }
  const { error: threadError } = await supabase.from('agent_threads').insert({
    user_id: user.id, league_id: input.leagueId, team_id: input.selectedTeamId, draft_session_id: session.id, title: `${input.name} Copilot`,
  })
  if (threadError) { await supabase.from('draft_sessions').delete().eq('id', session.id); throw threadError }
  return session as DraftSession
}

export async function getDraftState(id: string): Promise<DraftState> {
  const supabase = createClient()
  const [sessionResult, picksResult, threadResult] = await Promise.all([
    supabase.from('draft_sessions').select('*').eq('id', id).single(),
    supabase.from('draft_picks').select('*,player:players(id,name,position,nfl_team),team:fantasy_teams(id,name,external_id)').eq('draft_session_id', id).order('overall_pick'),
    supabase.from('agent_threads').select('*').eq('draft_session_id', id).maybeSingle(),
  ])
  if (sessionResult.error) throw sessionResult.error
  if (picksResult.error) throw picksResult.error
  if (threadResult.error) throw threadResult.error
  return { session: sessionResult.data as DraftSession, picks: picksResult.data as unknown as DraftState['picks'], thread: threadResult.data as AgentThread | null }
}

export async function recordDraftPick(sessionId: string, playerId: string, overallPick: number, revision: number) {
  const { data, error } = await createClient().rpc('record_draft_pick', { p_session_id: sessionId, p_player_id: playerId, p_overall_pick: overallPick, p_expected_revision: revision })
  if (error) throw error
  return data as DraftSession
}

export async function removeDraftPick(sessionId: string, overallPick: number, revision: number) {
  const { data, error } = await createClient().rpc('remove_draft_pick', { p_session_id: sessionId, p_overall_pick: overallPick, p_expected_revision: revision })
  if (error) throw error
  return data as DraftSession
}
