'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useRole } from '@/hooks/useRole'
import type { PermissionRole } from '@/lib/roles'

// Tabs (or a view toggle) held in the URL — ?tab=, ?view= or ?channel= — so a
// merged page's tab can be linked, bookmarked and survives a reload. Each tab
// keeps the gate its old page had; a tab the person may not see is not
// offered, and asking for it by URL falls back to the first one they may.

export interface UrlTab {
  key: string
  label: string
  roles: PermissionRole[]
  /** The tab's content. Rendered only while it is the open tab. */
  render: () => ReactNode
}

export function useUrlTab(tabs: UrlTab[], param: string): { visible: UrlTab[]; current: UrlTab | null } {
  const params = useSearchParams()
  const { role } = useRole()
  const visible = tabs.filter(t => t.roles.includes(role))
  const asked = params.get(param)
  const current = visible.find(t => t.key === asked) ?? visible[0] ?? null
  return { visible, current }
}

export default function UrlTabs({
  tabs,
  param = 'tab',
  label,
  variant = 'tabs',
}: {
  tabs: UrlTab[]
  param?: string
  /** Accessible name of the tab list, e.g. "Reports". */
  label: string
  /** 'toggle' draws a compact segmented control (List / Calendar). */
  variant?: 'tabs' | 'toggle'
}) {
  const pathname = usePathname()
  const params = useSearchParams()
  const { visible, current } = useUrlTab(tabs, param)

  // A full-height page inside a tab (an inbox) sizes itself against
  // --app-chrome (app/globals.css): add the strip's height to it.
  const stripRef = useRef<HTMLDivElement>(null)
  const [stripHeight, setStripHeight] = useState(0)
  useLayoutEffect(() => {
    const el = stripRef.current
    if (!el) { setStripHeight(0); return }
    const measure = () => setStripHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [visible.length])

  if (!current) return null

  const hrefFor = (key: string) => {
    const next = new URLSearchParams(params.toString())
    next.set(param, key)
    return `${pathname}?${next.toString()}`
  }

  return (
    <>
      {visible.length > 1 && (
        <div ref={stripRef} className="px-4 sm:px-6 pt-4">
          <div
            role="tablist"
            aria-label={label}
            className={
              variant === 'toggle'
                ? 'inline-flex p-1 rounded-lg border border-gray-200 bg-white'
                : 'flex gap-1 border-b border-gray-200 overflow-x-auto'
            }
          >
            {visible.map(t => {
              const active = t.key === current.key
              return (
                <Link
                  key={t.key}
                  href={hrefFor(t.key)}
                  replace
                  scroll={false}
                  role="tab"
                  aria-selected={active}
                  className={
                    variant === 'toggle'
                      ? `px-3 py-1.5 rounded-md text-sm font-medium ${active ? 'bg-primary-700 text-white' : 'text-gray-600 hover:text-gray-900'}`
                      : `px-3 py-2 -mb-px border-b-2 text-sm font-medium whitespace-nowrap ${
                          active ? 'border-primary-700 text-primary-800' : 'border-transparent text-gray-500 hover:text-gray-800'
                        }`
                  }
                >
                  {t.label}
                </Link>
              )
            })}
          </div>
        </div>
      )}
      <div
        role="tabpanel"
        aria-label={current.label}
        style={{ '--app-chrome': `calc(3.5rem + ${stripHeight}px)` } as CSSProperties}
      >
        {current.render()}
      </div>
    </>
  )
}
