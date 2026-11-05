import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import HomepageEditor from './HomepageEditor'
import type { HomepageSettings } from '../../lib/homepageContent'

vi.mock('../../lib/homepageContent', () => ({
  saveHomepageSettings: vi.fn(),
  uploadHomepageMedia: vi.fn(),
}))

// Rows created before the CMS section columns were added caused the admin crash.
const legacySettings = {
  id: 1,
  hero_eyebrow: 'A LIVE VISUAL STUDIO',
  hero_title_line_one: 'Live image.',
  hero_title_line_two: 'New possibility.',
  hero_intro: 'A creative workspace.',
  hero_media_kind: 'image',
  hero_media_url: '',
  demo_title: 'A demo',
  demo_description: 'A visual study.',
  demo_media_kind: 'image',
  demo_media_url: '',
  updated_at: '',
} as HomepageSettings

describe('Homepage admin schema recovery', () => {
  it('renders editable section lists when an older database row omits them', () => {
    render(<HomepageEditor initial={legacySettings} onSaved={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Workflow section' })).toBeVisible()
    expect(screen.getByLabelText('Question 1')).toHaveValue('What do I need to use Kinetelle Studio?')
    expect(screen.getByRole('button', { name: 'Save homepage changes' })).toBeEnabled()
  })

  it('keeps list title inputs focused throughout a multi-character edit', async () => {
    const user = userEvent.setup()
    render(<HomepageEditor initial={legacySettings} onSaved={vi.fn()} />)
    const input = screen.getAllByLabelText('Item 1 title')[0]
    await user.type(input, ' updated')
    expect(input).toHaveValue('Preview your source updated')
    expect(input).toHaveFocus()
  })
})
