import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminUserDetails from './AdminUserDetails'
import {
  adjustUserTime,
  getAdminUserDetails,
  type UserDetail,
} from '../../lib/adminDashboard'
vi.mock('../../lib/adminDashboard', () => ({
  adjustUserTime: vi.fn(),
  getAdminUserDetails: vi.fn(),
  duration: (seconds: number) => `${seconds / 60}m`,
  money: (amount: number, currency: string) => `${currency} ${amount}`,
}))
const detail: UserDetail = {
  id: 'member',
  email: 'member@example.com',
  created_at: '2026-11-05T00:00:00Z',
  last_sign_in_at: null,
  credited_seconds: 600,
  spent_seconds: 0,
  sessions: [],
  deposits: [],
  adjustments: [],
  grants: [],
}
beforeEach(() => {
  vi.mocked(adjustUserTime).mockReset()
  vi.mocked(getAdminUserDetails).mockReset()
  vi.mocked(getAdminUserDetails).mockResolvedValue(detail)
})
describe('Admin time adjustment retries', () => {
  it('reuses the adjustment reference after an uncertain failure and reports successful confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(adjustUserTime)
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(undefined)
    render(<AdminUserDetails userId="member" onChanged={vi.fn()} />)
    await user.click(await screen.findByText('Add or adjust live time'))
    await user.type(screen.getByLabelText('Minutes'), '10')
    await user.type(
      screen.getByLabelText('Reason visible in the member’s time record'),
      'Verified time correction',
    )
    await user.click(
      screen.getByRole('button', { name: 'Add time to this account' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connection lost',
    )
    await user.click(
      screen.getByRole('button', { name: 'Add time to this account' }),
    )
    await waitFor(() => expect(adjustUserTime).toHaveBeenCalledTimes(2))
    const calls = vi.mocked(adjustUserTime).mock.calls
    expect(calls[0][3]).toBe(calls[1][3])
    expect(await screen.findByRole('status')).toHaveTextContent(
      '10 minutes added',
    )
  })
})
