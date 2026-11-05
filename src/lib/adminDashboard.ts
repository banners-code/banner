import { getCurrentAccessToken, supabase } from './supabase'

export type DashboardSummary = {
  total_users: number
  active_users: number
  active_sessions: number
  total_sessions: number
  spent_seconds: number
  pending_deposits: number
  open_reports: number
  open_support: number
  money: { currency: string; approved: number; pending: number }[]
}
export type AdminNotification = {
  event_key: string
  kind: string
  title: string
  created_at: string
  destination: string
  read: boolean
}
export type ApiStatus = {
  uptime_seconds: number
  decart_configured: boolean
  account_verification: string
  token_requests: number
  tokens_issued: number
  failed_requests: number
  automatic_payments_ready: boolean
}
export type UserDetail = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  credited_seconds: number
  spent_seconds: number
  sessions: {
    id: string
    started_at: string
    ended_at: string | null
    duration_seconds: number
  }[]
  deposits: {
    id: string
    amount: number
    currency: string
    status: string
    payment_reference: string
    created_at: string
    admin_note: string
  }[]
  adjustments: {
    id: string
    delta_seconds: number
    reason: string
    created_at: string
  }[]
  grants: {
    id: string
    credit_seconds: number
    source: string
    created_at: string
  }[]
}
export type PaymentPack = {
  id: string
  name: string
  provider: 'bachs'
  provider_product_id: string
  currency: string
  display_amount: number
  credit_minutes: number
  enabled: boolean
}
function client() {
  if (!supabase) throw new Error('Admin services are unavailable.')
  return supabase
}
export async function getAdminDashboard(): Promise<DashboardSummary> {
  const { data, error } = await client().rpc('admin_get_dashboard')
  if (error) throw error
  return data
}
export async function getAdminNotifications(): Promise<AdminNotification[]> {
  const { data, error } = await client().rpc('admin_get_notifications')
  if (error) throw error
  return data ?? []
}
export async function markNotificationsRead(keys: string[]) {
  const {
    data: { user },
    error: authError,
  } = await client().auth.getUser()
  if (authError || !user)
    throw new Error('Sign in again to manage notifications.')
  const { error } = await client()
    .from('admin_notification_reads')
    .upsert(
      keys.map((event_key) => ({ admin_id: user.id, event_key })),
      { onConflict: 'admin_id,event_key', ignoreDuplicates: true },
    )
  if (error) throw error
}
export async function getAdminApiStatus(): Promise<ApiStatus> {
  const token = await getCurrentAccessToken()
  if (!token) throw new Error('Sign in to view API status.')
  const response = await fetch('/api/admin/status', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'API status is unavailable.')
  return data
}
export async function getAdminUserDetails(id: string): Promise<UserDetail> {
  const { data, error } = await client().rpc('admin_get_user_details', {
    p_user_id: id,
  })
  if (error) throw error
  return data
}
export async function adjustUserTime(
  id: string,
  minutes: number,
  reason: string,
  requestId: string,
) {
  const { error } = await client().rpc('admin_adjust_live_time', {
    p_user_id: id,
    p_minutes: minutes,
    p_reason: reason.trim(),
    p_request_id: requestId,
  })
  if (error) throw error
}
export async function loadPaymentPacks(): Promise<PaymentPack[]> {
  const { data, error } = await client()
    .from('automatic_payment_packs')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}
export async function savePaymentPack(pack: PaymentPack) {
  const { error } = await client()
    .from('automatic_payment_packs')
    .upsert({ ...pack, updated_at: new Date().toISOString() })
  if (error) throw error
}
export function duration(seconds: number) {
  const total = Math.floor(Math.max(0, Number(seconds)))
  const minutes = Math.floor(total / 60)
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : minutes > 0
      ? `${minutes}m ${total % 60}s`
      : `${total}s`
}
export function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(Number(amount))
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`
  }
}
