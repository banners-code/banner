import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type MediaKind = 'image' | 'video'
export type HomepageTextPair = { title: string; copy: string }
export type HomepageFAQ = { question: string; answer: string }

export type HomepageSettings = {
  id: number
  hero_eyebrow: string
  hero_title_line_one: string
  hero_title_line_two: string
  hero_intro: string
  hero_primary_action: string
  hero_secondary_action: string
  hero_media_kind: MediaKind
  hero_media_url: string
  workflow_eyebrow: string
  workflow_heading_one: string
  workflow_heading_two: string
  workflow_intro: string
  workflow_steps: HomepageTextPair[]
  feature_eyebrow: string
  feature_heading_one: string
  feature_heading_two: string
  feature_intro: string
  feature_cards: HomepageTextPair[]
  demo_title: string
  demo_description: string
  demo_media_kind: MediaKind
  demo_media_url: string
  faq_eyebrow: string
  faq_heading_one: string
  faq_heading_two: string
  faq_intro: string
  faq_items: HomepageFAQ[]
  closing_heading_one: string
  closing_heading_two: string
  closing_copy: string
  updated_at: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function loadHomepageSettings() {
  const client = requireSupabase()
  const { data, error } = await client.from('homepage_settings').select('*').eq('id', 1).single()
  if (error) throw error
  return data as HomepageSettings
}

export async function saveHomepageSettings(settings: Omit<HomepageSettings, 'id' | 'updated_at'>) {
  const client = requireSupabase()
  const { data, error } = await client.from('homepage_settings')
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select('*')
    .single()
  if (error) throw error
  return data as HomepageSettings
}

export async function uploadHomepageMedia(file: File, slot: 'hero' | 'demo') {
  const client = requireSupabase()
  const extension = file.type === 'image/jpeg' ? 'jpg'
    : file.type === 'image/png' ? 'png'
      : file.type === 'image/webp' ? 'webp'
        : file.type === 'video/mp4' ? 'mp4'
          : file.type === 'video/webm' ? 'webm'
            : ''
  if (!extension) throw new Error('Choose a JPG, PNG, WebP, MP4, or WebM file.')
  const path = `homepage/${slot}/${crypto.randomUUID()}.${extension}`
  const { error } = await client.storage.from('site-media').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return client.storage.from('site-media').getPublicUrl(path).data.publicUrl
}

export function subscribeToHomepageSettings(onChange: () => void): RealtimeChannel {
  const client = requireSupabase()
  return client.channel(`homepage-settings-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'homepage_settings' }, onChange)
    .subscribe()
}

export async function removeHomepageSettingsSubscription(channel: RealtimeChannel) {
  const client = requireSupabase()
  await client.removeChannel(channel)
}
