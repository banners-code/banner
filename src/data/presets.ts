export type StudioPreset = {
  id: string
  name: string
  note: string
  prompt: string
  filter: string
  swatch: string
  category: string
}

export const studioPresets: StudioPreset[] = [
  {
    id: 'photorealistic-human',
    name: 'Photorealistic Human',
    note: 'Natural proportions · true-to-life detail',
    prompt: 'Photorealistic human',
    filter: 'none',
    swatch: 'swatch-human',
    category: 'Portrait',
  },
]

export function findPreset(id: string | null | undefined) {
  return studioPresets.find((preset) => preset.id === id) ?? studioPresets[0]
}

export const defaultPrompt = 'Photorealistic human'
