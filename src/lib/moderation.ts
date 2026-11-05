import { supabase } from './supabase'

export type AccountAccess = { status: 'active' | 'suspended' | 'banned'; reason: string | null; suspended_until: string | null }
export type ManagedUser = AccountAccess & { id: string; email: string; created_at: string; last_sign_in_at: string | null; is_admin: boolean; credited_seconds: number; spent_seconds: number }
export type AbuseReport = { id: string; reporter_id: string; reported_identity: string; details: string; status: 'open' | 'reviewing' | 'resolved' | 'dismissed'; admin_note: string; created_at: string }
export type AuditEvent = { id: string; actor_id: string | null; target_id: string | null; action: string; details: Record<string, unknown>; created_at: string }

function client() {
  if (!supabase) throw new Error('Account services are unavailable.')
  return supabase
}
export async function getAccountAccess(): Promise<AccountAccess> {
  const { data, error } = await client().rpc('get_account_access')
  if (error) throw error
  if (!data || !['active', 'suspended', 'banned'].includes(data.status)) throw new Error('Account access could not be verified.')
  return data as AccountAccess
}
export async function searchUsers(query: string, offset = 0): Promise<{ users: ManagedUser[]; has_more: boolean }> {
  const { data, error } = await client().rpc('admin_search_users', { p_query: query.trim(), p_offset: offset })
  if (error) throw error
  return data
}
export async function setAccountStatus(userId: string, status: AccountAccess['status'], reason: string, until: string | null) {
  const { error } = await client().rpc('admin_set_account_status', { p_user_id: userId, p_status: status, p_reason: reason.trim(), p_suspended_until: status === 'suspended' ? until : null })
  if (error) throw error
}
export async function loadReports(): Promise<AbuseReport[]> {
  const { data, error } = await client().from('abuse_reports').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data ?? []
}
export async function submitReport(identity: string, details: string) {
  const { error } = await client().rpc('submit_abuse_report', { p_identity: identity.trim(), p_details: details.trim() })
  if (error) throw error
}
export async function reviewReport(id: string, status: string, note: string) {
  const { error } = await client().rpc('admin_review_abuse_report', { p_report_id: id, p_status: status, p_note: note.trim() })
  if (error) throw error
}
export async function loadAuditEvents(): Promise<AuditEvent[]> {
  const { data, error } = await client().from('admin_audit_events').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data ?? []
}
