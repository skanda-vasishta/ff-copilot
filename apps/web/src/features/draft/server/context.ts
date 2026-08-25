import type { SupabaseClient } from '@supabase/supabase-js'

export const DRAFT_SYSTEM_PROMPT = `You are FF Copilot in a manual fantasy-football draft room.

Help the user make decisions using the authoritative draft snapshot supplied at the beginning of this run. Every team and drafted roster is included. Never recommend a player who is already drafted. Distinguish current projections, source rankings, prior-season results, injuries, and source sentiment. Retrieve player facts before making player-specific claims. Treat the snapshot as fixed for this agent run; draft events that occur afterward apply to the next user request. Keep advice direct and draft-specific.`

export async function buildDraftContext(supabase: SupabaseClient, draftSessionId: string, userId: string) {
  const { data: session, error: sessionError } = await supabase.from('draft_sessions')
    .select('*,league:leagues(id,name,season,scoring_format_label,lineup_slot_counts),selected_team:fantasy_teams(id,name)')
    .eq('id', draftSessionId).eq('user_id', userId).single()
  if (sessionError || !session) throw new Error('Could not load the draft session')
  const { data: teams, error: teamsError } = await supabase.from('fantasy_teams')
    .select('id,name,external_id').eq('league_id', session.league_id)
  if (teamsError) throw new Error('Could not load draft teams')
  const { data: picks, error: picksError } = await supabase.from('draft_picks')
    .select('overall_pick,round_number,round_pick,fantasy_team_id,selected_at,player:players(id,name,position,nfl_team)')
    .eq('draft_session_id', session.id).order('overall_pick')
  if (picksError) throw new Error('Could not load the draft board')

  const byTeam = new Map<string, typeof picks>()
  for (const team of teams || []) byTeam.set(team.id, [])
  for (const pick of picks || []) byTeam.get(pick.fantasy_team_id)?.push(pick)
  const order = session.team_order as string[]
  const teamById = new Map((teams || []).map((team) => [team.id, team]))
  const total = order.length * session.round_count
  const teamForPick = (overall: number) => {
    const round = Math.floor((overall - 1) / order.length)
    const offset = (overall - 1) % order.length
    return order[session.draft_type === 'snake' && round % 2 === 1 ? order.length - 1 - offset : offset]
  }
  const currentTeamId = session.current_overall_pick <= total ? teamForPick(session.current_overall_pick) : null
  const userUpcoming: number[] = []
  for (let overall = session.current_overall_pick; overall <= total && userUpcoming.length < 5; overall += 1) {
    if (teamForPick(overall) === session.selected_team_id) userUpcoming.push(overall)
  }

  const lines = [
    '# MANUAL DRAFT STATE (authoritative snapshot)',
    `Draft: ${session.name}; status: ${session.status}; revision: ${session.revision}`,
    `Format: ${order.length}-team ${session.draft_type}; ${session.round_count} rounds; season ${session.season}`,
    `Scoring: ${session.league.scoring_format_label || 'custom'}; lineup: ${JSON.stringify(session.league.lineup_slot_counts || {})}`,
    `Current pick: ${session.current_overall_pick <= total ? session.current_overall_pick : 'complete'}; team on clock: ${currentTeamId ? teamById.get(currentTeamId)?.name : 'none'}`,
    `User team: ${session.selected_team.name}; upcoming user picks: ${userUpcoming.join(', ') || 'none'}`,
    '',
    '## Drafted rosters by team',
  ]
  for (const teamId of order) {
    const team = teamById.get(teamId)
    const roster = byTeam.get(teamId) || []
    lines.push('', `### ${teamId === session.selected_team_id ? 'YOUR TEAM — ' : ''}${team?.name || teamId}`)
    if (!roster.length) lines.push('No selections yet.')
    else for (const pick of roster) {
      const player = pick.player as unknown as { id: string; name: string; position: string | null; nfl_team: string | null }
      lines.push(`- Pick ${pick.overall_pick} (${pick.round_number}.${pick.round_pick}): ${player.name} | ${player.position || '?'} ${player.nfl_team || 'FA'} | player_id ${player.id}`)
    }
  }
  lines.push('', '## Recent picks')
  for (const pick of (picks || []).slice(-16)) {
    const player = pick.player as unknown as { name: string; position: string | null }
    lines.push(`${pick.overall_pick}. ${teamById.get(pick.fantasy_team_id)?.name}: ${player.name} (${player.position || '?'})`)
  }
  return lines.join('\n')
}
