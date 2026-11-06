import { supabase } from './supabase'

export type LiveUsageSession = {
  id: string
  started_at: string
  ended_at: string | null
  active: boolean
  duration_seconds: number
}
export type LiveUsageSummary = {
  lifetime_credited_seconds?: number
  expired_seconds?: number
  expiring_credits?: { remaining_seconds: number; expires_at: string }[]
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
    lifetime_credited_seconds:
      Number(summary.lifetime_credited_seconds ?? summary.credited_seconds) ||
      0,
    expired_seconds: Number(summary.expired_seconds) || 0,
    expiring_credits: Array.isArray(summary.expiring_credits)
      ? summary.expiring_credits
          .map((lot) => ({
            remaining_seconds: Number(lot.remaining_seconds) || 0,
            expires_at: String(lot.expires_at),
          }))
          .filter(
            (lot) =>
              lot.remaining_seconds > 0 &&
              Number.isFinite(new Date(lot.expires_at).getTime()),
          )
      : [],
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
