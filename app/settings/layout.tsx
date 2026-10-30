'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, Lock } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { settingsNavFor, settingsEntryFor, activeHref, LAST_APP_PATH_KEY } from '@/lib/nav/config'

// The Settings area: "← Back to app", then the grouped settings sidebar from
// lib/nav/config.ts. Each page gets its breadcrumb, H1, one-line description
// and "Admins only" badge here, from the same entry — so the name in the
// sidebar, the breadcrumb and the title can never drift apart.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { role } = useRole()
  const groups = useMemo(() => settingsNavFor(role), [role])
  const current = activeHref(groups.flatMap(g => g.items), pathname)
  const entry = settingsEntryFor(pathname)

  const [backHref, setBackHref] = useState('/dashboard')
  useEffect(() => {
    try {
      const last = sessionStorage.getItem(LAST_APP_PATH_KEY)
      if (last && last.startsWith('/') && !last.startsWith('/settings')) setBackHref(last)
    } catch { /* storage blocked */ }
  }, [])

  return (
    <div className="flex flex-col lg:flex-row min-h-full">
      <nav
        aria-label="Settings"
        className="lg:w-64 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 lg:sticky lg:top-0 lg:h-[calc(100vh-3.5rem)] overflow-y-auto px-3 py-4"
      >
        <Link href={backHref} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft size={16} strokeWidth={1.7} aria-hidden /> Back to app
        </Link>
        <p className="px-3 pt-3 pb-2 text-lg font-semibold text-gray-900">Settings</p>
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.key}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{group.title}</p>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = item.href === current
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`block px-3 py-1.5 rounded-lg text-[14px] ${
                        isActive ? 'bg-primary-100/70 text-primary-800 font-medium' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="flex-1 min-w-0">
        {entry && (
          <div className="max-w-5xl px-4 sm:px-6 lg:px-8 pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-gray-500">Settings › {entry.group.title}</p>
                <h1 className="mt-1 text-2xl font-semibold text-gray-900">{entry.item.label}</h1>
                <p className="mt-1 text-sm text-gray-600">{entry.item.description}</p>
              </div>
              {entry.item.adminOnly && (
                <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                  <Lock size={12} strokeWidth={1.7} aria-hidden /> Admins only
                </span>
              )}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
