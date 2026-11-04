import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type SupportCategory = 'account' | 'camera' | 'live-session' | 'technical' | 'feedback' | 'other'
export type SupportStatus = 'open' | 'closed'
export type SupportRole = 'customer' | 'admin'

export type SupportContactSettings = {
  id: number
  welcome_message: string
  contact_email: string
  contact_url: string
  contact_label: string
  chat_enabled: boolean
  updated_at: string
}

export type SupportConversation = {
  id: string
  owner_id: string
  owner_email: string
  category: SupportCategory
  subject: string
  status: SupportStatus
  created_at: string
  updated_at: string
}

export type SupportMessage = {
  id: string
  conversation_id: string
  sender_id: string
  sender_role: SupportRole
  body: string
  created_at: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Support is unavailable until Supabase is configured.')
  return supabase
}

export async function loadPublicSupportSettings() {
  const client = requireSupabase()
  const { data, error } = await client.from('support_contact_settings').select('*').eq('id', 1).single()
  if (error) throw error
  return data as SupportContactSettings
}

export async function saveSupportSettings(settings: Pick<SupportContactSettings, 'welcome_message' | 'contact_email' | 'contact_url' | 'contact_label' | 'chat_enabled'>) {
  const client = requireSupabase()
  const { data, error } = await client.from('support_contact_settings').update({ ...settings, updated_at: new Date().toISOString() }).eq('id', 1).select('*').single()
  if (error) throw error
  return data as SupportContactSettings
}

export async function hasSupportAdminAccess() {
  const client = requireSupabase()
  const { data, error } = await client.rpc('is_support_admin')
  if (error) throw error
  return data === true
}

export async function loadSupportConversations() {
  const client = requireSupabase()
  const { data, error } = await client.from('support_conversations').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SupportConversation[]
}

export async function loadSupportMessages(conversationId: string) {
  const client = requireSupabase()
  const { data, error } = await client.from('support_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as SupportMessage[]
}

export async function createSupportConversation(input: {
  ownerId: string
  ownerEmail: string
  category: SupportCategory
  subject: string
  firstMessage: string
}) {
  const client = requireSupabase()
  const { data: conversation, error: conversationError } = await client
    .from('support_conversations')
    .insert({ owner_id: input.ownerId, owner_email: input.ownerEmail, category: input.category, subject: input.subject.trim() })
    .select('*')
    .single()
  if (conversationError) throw conversationError

  const { error: messageError } = await client.from('support_messages').insert({
    conversation_id: conversation.id,
    sender_id: input.ownerId,
    body: input.firstMessage.trim(),
  })
  if (messageError) throw messageError
  return conversation as SupportConversation
}

export async function sendSupportMessage(input: { conversationId: string; senderId: string; body: string }) {
  const client = requireSupabase()
  const { data, error } = await client.from('support_messages').insert({
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body: input.body.trim(),
  }).select('*').single()
  if (error) throw error
  return data as SupportMessage
}

export async function setSupportConversationStatus(conversationId: string, status: SupportStatus) {
  const client = requireSupabase()
  const { error } = await client.from('support_conversations').update({ status }).eq('id', conversationId)
  if (error) throw error
}

export function subscribeToSupportChanges(onChange: (payload: unknown) => void): RealtimeChannel {
  const client = requireSupabase()
  return client.channel(`support-inbox-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_contact_settings' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, onChange)
    .subscribe()
}

export function subscribeToContactSettings(onChange: () => void): RealtimeChannel {
  const client = requireSupabase()
  return client.channel(`support-contact-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_contact_settings' }, onChange)
    .subscribe()
}

export async function removeSupportSubscription(channel: RealtimeChannel) {
  const client = requireSupabase()
  await client.removeChannel(channel)
}
