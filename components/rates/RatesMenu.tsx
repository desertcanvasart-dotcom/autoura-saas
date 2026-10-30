'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { RATE_GROUPS, rateCategoryHref } from '@/lib/nav/config'
import type { RatesSummary } from '@/lib/rates/rate-categories'

// The Rates page's own menu: Overview, then the fourteen rate sheets in four
// groups, each with its count. It replaces the fourteen links the main
// sidebar used to carry. One summary fetch feeds the menu and the Overview.

interface SummaryState {
  summary: RatesSummary | null
  error: string | null
}

const SummaryContext = createContext<SummaryState>({ summary: null, error: null })

export function useRatesSummary(): SummaryState {
  return useContext(SummaryContext)
}

export function RatesSummaryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [state, setState] = useState<SummaryState>({ summary: null, error: null })
  // Refetched as the person moves between sheets, so a rate just added or
  // removed shows in the counts.
  useEffect(() => {
    let alive = true
    fetch('/api/rates/summary')
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        if (j?.success) setState({ summary: j.data, error: null })
        else setState(s => ({ summary: s.summary, error: j?.error || 'Could not count the rates' }))
      })
      .catch(() => { if (alive) setState(s => ({ summary: s.summary, error: 'Could not count the rates' })) })
    return () => { alive = false }
  }, [pathname])
  return <SummaryContext.Provider value={state}>{children}</SummaryContext.Provider>
}

export default function RatesMenu() {
  const pathname = usePathname()
  const router = useRouter()
  const { summary } = useRatesSummary()
  const count = (slug: string) => summary?.categories[slug]?.count

  const item = (href: string, label: string, n?: number) => {
    const active = pathname === href || (href !== '/rates' && pathname.startsWith(href + '/'))
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-[14px] ${
          active ? 'bg-primary-100/70 text-primary-800 font-medium' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <span className="truncate">{label}</span>
        {n !== undefined && <span className="text-xs text-gray-400 tabular-nums">{n}</span>}
      </Link>
    )
  }

  return (
    <>
      {/* Small screens: one picker instead of the column. */}
      <div className="lg:hidden px-4 pt-4">
        <label className="sr-only" htmlFor="rates-category">Rate category</label>
        <select
          id="rates-category"
          value={pathname}
          onChange={e => router.push(e.target.value)}
          className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm"
        >
          <option value="/rates">Overview</option>
          {RATE_GROUPS.map(g => (
            <optgroup key={g.key} label={g.title}>
              {g.categories.map(c => (
                <option key={c.slug} value={rateCategoryHref(c.slug)}>
                  {c.label}{count(c.slug) !== undefined ? ` (${count(c.slug)})` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <nav
        aria-label="Rate categories"
        className="hidden lg:block w-60 shrink-0 self-start sticky top-4 m-4 mr-0 p-2 bg-white border border-gray-200 rounded-xl"
      >
        {item('/rates', 'Overview')}
        {RATE_GROUPS.map(g => (
          <div key={g.key} className="mt-3">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{g.title}</p>
            <div className="space-y-0.5">{g.categories.map(c => item(rateCategoryHref(c.slug), c.label, count(c.slug)))}</div>
          </div>
        ))}
      </nav>
    </>
  )
}
