import {
  Bell,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Home,
  LayoutDashboard,
  MessageCircle,
  Settings2,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useEffect, useId, useState } from 'react'
import BrandMark from '../../components/BrandMark'

export const adminPaths = {
  dashboard: '/admin',
  users: '/admin/users',
  deposits: '/admin/deposits',
  reports: '/admin/reports',
  support: '/admin/support',
  notifications: '/admin/notifications',
  audit: '/admin/history',
  'app-settings': '/admin/settings/app',
  'payment-settings': '/admin/settings/payments',
  'contact-settings': '/admin/settings/contact',
} as const
export type AdminSection = keyof typeof adminPaths
export const adminTitles: Record<AdminSection, string> = {
  dashboard: 'Admin Dashboard',
  users: 'Manage Users',
  deposits: 'Deposits',
  reports: 'Abuse Reports',
  support: 'Support Inbox',
  notifications: 'Notifications',
  audit: 'Action History',
  'app-settings': 'App Settings',
  'payment-settings': 'Payment Settings',
  'contact-settings': 'Contact Settings',
}
const links = [
  ['dashboard', LayoutDashboard],
  ['users', Users],
  ['deposits', CreditCard],
  ['reports', ShieldCheck],
  ['support', MessageCircle],
  ['notifications', Bell],
  ['audit', ClipboardList],
] as const
export default function AdminSidebar({
  section,
  unread,
  pending,
  onNavigate,
  email,
}: {
  section: AdminSection
  unread: number
  pending: number
  onNavigate: () => void
  email: string
}) {
  const [expanded, setExpanded] = useState(section.endsWith('settings'))
  const settingsId = useId()
  useEffect(() => {
    if (section.endsWith('settings')) setExpanded(true)
  }, [section])
  const settingsOpen = expanded
  return (
    <div className="admin-side-inner">
      <div className="admin-side-brand">
        <BrandMark />
        <span>CONTROL ROOM</span>
      </div>
      <nav aria-label="Admin navigation" className="admin-side-nav">
        {links.map(([key, Icon]) => (
          <NavLink
            key={key}
            end
            to={adminPaths[key]}
            onClick={onNavigate}
            className={({ isActive }) => (isActive ? 'is-active' : '')}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{adminTitles[key]}</span>
            {key === 'notifications' && unread > 0 && <b>{unread}</b>}
            {key === 'deposits' && pending > 0 && <b>{pending}</b>}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          className={`admin-settings-disclosure${settingsOpen ? ' is-open' : ''}`}
          onClick={() => setExpanded(!settingsOpen)}
        >
          <Settings2 size={17} aria-hidden="true" />
          <span>Settings</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        <div
          id={settingsId}
          hidden={!settingsOpen}
          className="admin-side-subnav"
        >
          {(
            ['app-settings', 'payment-settings', 'contact-settings'] as const
          ).map((key) => (
            <NavLink
              key={key}
              to={adminPaths[key]}
              onClick={onNavigate}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              {adminTitles[key]}
            </NavLink>
          ))}
        </div>
      </nav>
      <footer className="admin-side-footer">
        <NavLink to="/dashboard" onClick={onNavigate}>
          <CircleHelp size={15} />
          Member dashboard
        </NavLink>
        <NavLink to="/" onClick={onNavigate}>
          <Home size={15} />
          View website
        </NavLink>
        <span>{email}</span>
      </footer>
    </div>
  )
}
