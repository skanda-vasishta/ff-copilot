import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

export type Player = {
  id: string
  name: string
  position: string | null
  nfl_team: string | null
  season: number | null
  injury_status: string | null
  projected_total_points: number | null
  projected_average_points: number | null
  average_rank: number | null
  median_rank: number | null
  source_count: number
  fetched_at: string | null
}

export type Paginated<T> = { items: T[]; page: number; page_size: number; total: number }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('You must sign in')
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(body.detail || 'Request failed')
  }
  return response.status === 204 ? undefined as T : response.json()
}

export function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => value !== undefined && value !== '' && params.set(key, String(value)))
  return params.toString()
}
