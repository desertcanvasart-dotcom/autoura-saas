'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { RatesSummary } from '@/lib/rates/rate-categories'

// How many rates each sheet holds, for the Rates Overview. Fetched when the
// Overview opens, so a rate just added or removed shows in the counts.
// (The rates' own side menu that also showed these was retired 2026-11-07: the
// main sidebar already lists every rate sheet, and two menus of the same pages
// left the tables no room.)

interface SummaryState {
  summary: RatesSummary | null
  error: string | null
}

const SummaryContext = createContext<SummaryState>({ summary: null, error: null })

export function useRatesSummary(): SummaryState {
  return useContext(SummaryContext)
}

export function RatesSummaryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SummaryState>({ summary: null, error: null })
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
  }, [])
  return <SummaryContext.Provider value={state}>{children}</SummaryContext.Provider>
}
