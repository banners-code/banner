import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type StudioAspect = 'landscape' | 'portrait'

export type StudioPreferences = {
  prompt: string
  aspect: StudioAspect
  preset_id: string
}

export type SavedDirection = {
  id: string
  title: string
  prompt: string
  preset_id: string
  created_at: string
}

export async function loadStudioLibrary(user: User) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const [preferenceResult, directionResult] = await Promise.all([
    supabase
      .from('studio_preferences')
      .select('prompt, aspect, preset_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('saved_directions')
      .select('id, title, prompt, preset_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  if (preferenceResult.error) throw preferenceResult.error
  if (directionResult.error) throw directionResult.error
  const preferences = preferenceResult.data as StudioPreferences | null
  const directions = (directionResult.data || []) as SavedDirection[]
  return { preferences, directions }
}

export async function exportStudioData(user: User) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const preferenceResult = await supabase
    .from('studio_preferences')
    .select('prompt, aspect, preset_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (preferenceResult.error) throw preferenceResult.error

  const pageSize = 500
  const directions: SavedDirection[] = []
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from('saved_directions')
      .select('id, title, prompt, preset_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (result.error) throw result.error
    const page = (result.data || []) as SavedDirection[]
    directions.push(...page)
    if (page.length < pageSize) break
  }

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    preferences: preferenceResult.data as StudioPreferences | null,
    savedDirections: directions,
  }
}

export async function saveStudioPreferences(user: User, preferences: StudioPreferences) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase
    .from('studio_preferences')
    .upsert({
      user_id: user.id,
      prompt: preferences.prompt.slice(0, 280),
      aspect: preferences.aspect,
      preset_id: preferences.preset_id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) throw error
}

export async function createSavedDirection(user: User, prompt: string, presetId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const cleanPrompt = prompt.trim().slice(0, 280)
  if (!cleanPrompt) throw new Error('Add a direction before saving it.')
  const title = cleanPrompt.length > 48 ? cleanPrompt.slice(0, 47).trimEnd() + '…' : cleanPrompt
  const { data, error } = await supabase
    .from('saved_directions')
    .insert({ user_id: user.id, title, prompt: cleanPrompt, preset_id: presetId })
    .select('id, title, prompt, preset_id, created_at')
    .single()

  if (error) throw error
  return data as SavedDirection
}

export async function removeSavedDirection(user: User, id: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase
    .from('saved_directions')
    .delete()
    .eq('user_id', user.id)
    .eq('id', id)

  if (error) throw error
}

export async function deleteStudioData(user: User) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const preferencesResult = await supabase
    .from('studio_preferences')
    .delete()
    .eq('user_id', user.id)
  if (preferencesResult.error) throw preferencesResult.error

  const directionsResult = await supabase
    .from('saved_directions')
    .delete()
    .eq('user_id', user.id)
  if (directionsResult.error) throw directionsResult.error
}
