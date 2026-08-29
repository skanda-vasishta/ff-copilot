import type { AgentThread } from '@ff-copilot/agent-runtime'

export type DraftTeam = { id: string; name: string; external_id: string }
export type DraftParticipant = { id: string; draft_session_id: string; external_team_id: string; name: string; abbreviation: string | null; draft_position: number; is_user: boolean }
export type DraftPlayer = { id: string; espn_id?: string | null; name: string; position: string | null; nfl_team: string | null; projected_total_points: number | null; median_rank: number | null; average_rank: number | null; injury_status: string | null }
export type DraftPick = { id: string; overall_pick: number; round_number: number; round_pick: number; fantasy_team_id: string | null; draft_participant_id: string | null; player_id: string; selected_at: string; player: DraftPlayer; team: DraftTeam | null; participant: DraftParticipant | null }
export type DraftSession = { id: string; user_id: string; league_id: string; selected_team_id: string; season: number; name: string; source: 'manual' | 'espn_live'; external_league_id: string | null; external_team_id: string | null; status: 'setup' | 'active' | 'completed'; draft_type: 'snake' | 'linear'; team_order: string[]; round_count: number; current_overall_pick: number; revision: number; created_at: string; updated_at: string; completed_at: string | null }
export type DraftState = { session: DraftSession; picks: DraftPick[]; participants: DraftParticipant[]; thread: AgentThread | null }
