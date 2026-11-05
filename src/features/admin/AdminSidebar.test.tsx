import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AdminSidebar from './AdminSidebar'

describe('Admin sidebar navigation', () => {
  it('groups app, payment and contact settings in a collapsible menu', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/admin/settings/app']}>
        <AdminSidebar
          section="app-settings"
          unread={2}
          pending={1}
          onNavigate={vi.fn()}
          email="admin@example.com"
        />
      </MemoryRouter>,
    )
    const navigation = screen.getByRole('navigation', {
      name: 'Admin navigation',
    })
    expect(
      within(navigation).getByRole('link', { name: 'Admin Dashboard' }),
    ).toHaveAttribute('href', '/admin')
    expect(
      within(navigation).getByRole('link', { name: 'Manage Users' }),
    ).toHaveAttribute('href', '/admin/users')
    expect(screen.getByRole('link', { name: 'App Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const settings = screen.getByRole('button', { name: 'Settings' })
    expect(settings).toHaveAttribute('aria-expanded', 'true')
    await user.click(settings)
    expect(settings).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('link', { name: 'Payment Settings' }),
    ).not.toBeInTheDocument()
    await user.click(settings)
    expect(
      screen.getByRole('link', { name: 'Contact Settings' }),
    ).toHaveAttribute('href', '/admin/settings/contact')
  })
})
