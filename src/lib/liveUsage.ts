import { supabase } from './supabase'

export type LiveUsageSession = {
  id: string
  started_at: string
  ended_at: string | null
  active: boolean
  duration_seconds: number
}

export type LiveUsageSummary = {
  credited_seconds: number
  spent_seconds: number
  session_count: number
  sessions: LiveUsageSession[]
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function loadLiveUsageSummary(): Promise<LiveUsageSummary> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_live_usage_summary')
  if (error) throw error

  const summary = data as Partial<LiveUsageSummary> | null
  if (!summary || !Array.isArray(summary.sessions)) {
    throw new Error('The live usage summary is unavailable.')
  }

  return {
    credited_seconds: Number(summary.credited_seconds) || 0,
    spent_seconds: Number(summary.spent_seconds) || 0,
    session_count: Number(summary.session_count) || 0,
    sessions: summary.sessions.map((session) => ({
      id: String(session.id),
      started_at: String(session.started_at),
      ended_at: session.ended_at ? String(session.ended_at) : null,
      active: Boolean(session.active),
      duration_seconds: Number(session.duration_seconds) || 0,
    })),
  }
}

export async function startLiveUsageSession() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('start_live_usage_session')
  if (error) throw error
  if (typeof data !== 'string') throw new Error('The live usage session could not be started.')
  return data
}

export async function touchLiveUsageSession(sessionId: string) {
  const client = requireSupabase()
  const { error } = await client.rpc('touch_live_usage_session', { p_session_id: sessionId })
  if (error) throw error
}

export async function stopLiveUsageSession(sessionId: string) {
  const client = requireSupabase()
  const { error } = await client.rpc('stop_live_usage_session', { p_session_id: sessionId })
  if (error) throw error
}
