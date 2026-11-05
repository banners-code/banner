import type { RealtimeChannel, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getAccountAccess } from './moderation'

export type FundingSettings = {
  id: number
  enabled: boolean
  payment_mode: 'off' | 'manual' | 'automatic'
  currency: string
  payment_instructions: string
  reference_instructions: string
  minimum_amount: number
  updated_at: string
}

export type ManualFundingRequest = {
  id: string
  owner_id: string
  owner_email: string
  amount: number
  currency: string
  payment_reference: string
  proof_object_path: string
  user_note: string
  status: 'pending' | 'approved' | 'rejected'
  credits_granted_seconds: number | null
  admin_note: string
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function loadFundingSettings() {
  const client = requireSupabase()
  const { data, error } = await client.from('funding_settings').select('*').eq('id', 1).single()
  if (error) throw error
  return data as FundingSettings
}

export async function saveFundingSettings(settings: Pick<FundingSettings, 'enabled' | 'payment_mode' | 'currency' | 'payment_instructions' | 'reference_instructions' | 'minimum_amount'>) {
  const client = requireSupabase()
  const { data, error } = await client.from('funding_settings')
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('*')
    .single()
  if (error) throw error
  return data as FundingSettings
}

export async function loadOwnFundingRequests() {
  const client = requireSupabase()
  const { data, error } = await client.from('manual_funding_requests').select('*').order('created_at', { ascending: false }).limit(20)
  if (error) throw error
  return (data ?? []) as ManualFundingRequest[]
}

export async function loadAllFundingRequests() {
  const client = requireSupabase()
  const { data, error } = await client.from('manual_funding_requests').select('*').order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return (data ?? []) as ManualFundingRequest[]
}

function proofExtension(file: File) {
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'application/pdf') return 'pdf'
  return ''
}

export async function createManualFundingRequest(input: {
  user: User
  amount: number
  currency: string
  paymentReference: string
  userNote: string
  proof: File
}) {
  const client = requireSupabase()
  const extension = proofExtension(input.proof)
  if ((await getAccountAccess()).status !== 'active') throw new Error('Account funding is restricted. Contact Support to request a review.')
  if (!extension) throw new Error('Attach a JPG, PNG, WebP, or PDF payment receipt.')
  if (input.proof.size > 10 * 1024 * 1024) throw new Error('The payment receipt must be 10 MB or smaller.')
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Enter the amount you paid.')
  if (!input.user.email) throw new Error('Your account email is unavailable. Sign in again and retry.')

  const proofPath = `${input.user.id}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await client.storage.from('payment-proofs').upload(proofPath, input.proof, {
    cacheControl: '3600',
    contentType: input.proof.type,
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data, error } = await client.from('manual_funding_requests').insert({
    owner_id: input.user.id,
    owner_email: input.user.email,
    amount: input.amount,
    currency: input.currency,
    payment_reference: input.paymentReference.trim(),
    proof_object_path: proofPath,
    user_note: input.userNote.trim(),
  }).select('*').single()
  if (error) {
    await client.storage.from('payment-proofs').remove([proofPath]).catch(() => undefined)
    throw error
  }
  return data as ManualFundingRequest
}

export async function createFundingProofUrl(path: string) {
  const client = requireSupabase()
  const { data, error } = await client.storage.from('payment-proofs').createSignedUrl(path, 15 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function reviewManualFundingRequest(input: {
  requestId: string
  status: 'approved' | 'rejected'
  adminNote: string
  creditSeconds?: number
}) {
  const client = requireSupabase()
  const { error } = await client.rpc('review_manual_funding_request', {
    p_request_id: input.requestId,
    p_status: input.status,
    p_admin_note: input.adminNote.trim(),
    p_credit_seconds: input.status === 'approved' ? input.creditSeconds : null,
  })
  if (error) throw error
}

export function subscribeToFundingRequests(onChange: () => void): RealtimeChannel {
  const client = requireSupabase()
  return client.channel(`funding-requests-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'manual_funding_requests' }, onChange)
    .subscribe()
}

export async function removeFundingSubscription(channel: RealtimeChannel) {
  const client = requireSupabase()
  await client.removeChannel(channel)
}
