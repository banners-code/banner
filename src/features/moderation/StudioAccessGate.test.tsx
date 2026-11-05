import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StudioAccessGate from './StudioAccessGate'
import { getAccountAccess } from '../../lib/moderation'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'member' }, loading: false }) }))
vi.mock('../../lib/moderation', () => ({ getAccountAccess: vi.fn() }))
beforeEach(() => { vi.mocked(getAccountAccess).mockReset() })
function showGate() { render(<MemoryRouter><StudioAccessGate><div>Live creative workspace</div></StudioAccessGate></MemoryRouter>) }
describe('Studio account restriction gate', () => {
  it('unmounts the Studio when a later access check reports a ban', async () => {
    vi.mocked(getAccountAccess).mockResolvedValue({ status: 'active', reason: null, suspended_until: null })
    showGate()
    expect(await screen.findByText('Live creative workspace')).toBeVisible()
    vi.mocked(getAccountAccess).mockResolvedValue({ status: 'banned', reason: 'Confirmed misuse', suspended_until: null })
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(await screen.findByText('Account restricted.')).toBeVisible()
    await waitFor(() => expect(screen.queryByText('Live creative workspace')).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Contact Support' })).toHaveAttribute('href', '/support')
  })
  it('does not mount the Studio when account verification fails', async () => {
    vi.mocked(getAccountAccess).mockRejectedValue(new Error('Offline'))
    showGate()
    expect(await screen.findByRole('alert')).toHaveTextContent('could not verify')
    expect(screen.queryByText('Live creative workspace')).not.toBeInTheDocument()
  })
})
