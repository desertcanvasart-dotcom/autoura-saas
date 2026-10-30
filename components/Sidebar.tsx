'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useInboxUnreadCount, useTeamBadges } from '@/lib/use-inbox-unread'
import { mainNavFor, activeHref, SETTINGS_LINK, LAST_APP_PATH_KEY, type NavBadge, type NavItem } from '@/lib/nav/config'

// The main sidebar: the daily work only, built from lib/nav/config.ts — no
// link is written here. Setup lives in the Settings area (its own layout),
// the rate sheets in the Rates page's menu, and the account, notifications
// and Copilot in the top bar.

interface SidebarProps {
  /** Small screens: the sidebar is a drawer opened from the top bar. */
  mobileOpen: boolean
  onMobileClose: () => void
}

// Collapsed sections, remembered per login. Storing the COLLAPSED ones means
// a section added later starts open.
const storageKey = (userId: string) => `autoura-sidebar-sections:${userId}`

export const ICON_PROPS = { size: 18, strokeWidth: 1.7 } as const

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { role, canAccess } = useRole()
  const sections = useMemo(() => mainNavFor(role), [role])

  // Unread emails in the user's Gmail inbox, badged on Inbox (a new arrival
  // also pops a toast — except on the Inbox page, which shows it itself),
  // plus the team's unread WhatsApp messages. Leads awaiting review on Leads.
  const works = canAccess(['admin', 'manager', 'member'])
  const inboxUnread = useInboxUnreadCount(works ? user?.id : null, { notify: !pathname.startsWith('/inbox') })
  const team = useTeamBadges(works, {
    notify: {
      whatsapp: !pathname.startsWith('/whatsapp-inbox'),
      concierge: !pathname.startsWith('/concierge-briefs'),
    },
  })
  const badges: Record<NavBadge, number | null> = {
    inbox: (inboxUnread ?? 0) + (team.whatsapp ?? 0) || null,
    leads: team.concierge || null,
  }

  const allItems = useMemo(() => sections.flatMap(s => s.items), [sections])
  const current = activeHref([...allItems, SETTINGS_LINK], pathname)
  const currentSection = sections.find(s => s.items.some(i => i.href === current))?.key

  const [collapsed, setCollapsed] = useState<string[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  useEffect(() => {
    if (!user?.id) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(user.id)) || '[]')
      setCollapsed(Array.isArray(saved) ? saved.filter((k: unknown) => typeof k === 'string') : [])
    } catch {
      setCollapsed([])
    }
    setLoadedFor(user.id)
  }, [user?.id])
  useEffect(() => {
    if (!user?.id || loadedFor !== user.id) return
    try { localStorage.setItem(storageKey(user.id), JSON.stringify(collapsed)) } catch { /* private mode */ }
  }, [collapsed, user?.id, loadedFor])

  const toggle = (key: string) =>
    setCollapsed(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]))

  // Close the drawer when the page changes, and remember the page for
  // Settings' "Back to app".
  useEffect(() => {
    onMobileClose()
    try { sessionStorage.setItem(LAST_APP_PATH_KEY, pathname) } catch { /* storage blocked */ }
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const isActive = item.href === current
    const badge = item.badge ? badges[item.badge] : null
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-colors ${
          isActive ? 'bg-primary-100/70 text-primary-800 font-medium' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <Icon {...ICON_PROPS} className={`shrink-0 ${isActive ? 'text-primary-700' : 'text-gray-500'}`} aria-hidden />
        <span className="truncate">{item.label}</span>
        {badge !== null && (
          <span
            className="ml-auto min-w-[22px] px-1.5 py-0.5 rounded-full bg-primary-700 text-white text-[11px] font-semibold leading-none text-center"
            aria-label={`${badge} new`}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Link>
    )
  }

  const settingsActive = current === SETTINGS_LINK.href
  const SettingsIcon = SETTINGS_LINK.icon

  return (
    <>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-14 bg-black/40 z-30" onClick={onMobileClose} aria-hidden />
      )}
      <aside
        id="main-sidebar"
        aria-label="Main navigation"
        className={`fixed lg:static top-14 bottom-0 left-0 z-40 w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col
          transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-3 [scrollbar-width:thin] [scrollbar-color:#d1d5db_transparent]">
          {sections.map(section => {
            const isOpen = section.key === currentSection || !collapsed.includes(section.key)
            const folded = !isOpen
            const hasNews = folded && section.items.some(i => i.badge && badges[i.badge])
            return (
              <div key={section.key}>
                {section.title && (
                  <button
                    type="button"
                    onClick={() => toggle(section.key)}
                    aria-expanded={isOpen}
                    className="flex items-center w-full px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700"
                  >
                    {section.title}
                    {hasNews && <span className="ml-2 w-2 h-2 rounded-full bg-primary-700" title="Something new inside" />}
                    <ChevronDown
                      size={14}
                      strokeWidth={1.7}
                      className={`ml-auto transition-transform ${isOpen ? '' : '-rotate-90'}`}
                      aria-hidden
                    />
                  </button>
                )}
                {isOpen && <div className="space-y-0.5">{section.items.map(renderItem)}</div>}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-gray-200 px-3 py-2.5">
          <Link
            href={SETTINGS_LINK.href}
            aria-current={settingsActive ? 'page' : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] ${
              settingsActive ? 'bg-primary-100/70 text-primary-800 font-medium' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <SettingsIcon {...ICON_PROPS} className="shrink-0 text-gray-500" aria-hidden />
            {SETTINGS_LINK.label}
          </Link>
        </div>
      </aside>
    </>
  )
}
