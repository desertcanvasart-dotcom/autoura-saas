'use client'

import type { ReactNode } from 'react'

// ============================================
// A band where each day starts
// ============================================
// Every breakdown in the app was a flat list: the calculator's table, the
// saved quote page (which showed category TOTALS and never the lines at all)
// and the tour detail page. An operator checking a quote against the programme
// had to count rows to find where day 4 began.
//
// One band per day, in the order the day runs (lib/pricing/breakdown-order),
// with the lines that belong to no single day — a whole-trip cruise, a water
// allowance — gathered at the end under "Whole trip".
//
// Ported from the sibling app (travel-ops-pro #460).

export interface DayBandGroup<T> {
  /** null for the whole-trip group. */
  day: number | null
  lines: T[]
}

/** Groups already-ordered lines into their days. Order is preserved. */
export function groupByDay<T>(lines: readonly T[], dayOf: (line: T) => number | null | undefined): DayBandGroup<T>[] {
  const groups: DayBandGroup<T>[] = []
  for (const line of lines) {
    const raw = dayOf(line)
    const day = typeof raw === 'number' && raw > 0 ? raw : null
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.lines.push(line)
    else groups.push({ day, lines: [line] })
  }
  // Whole-trip lines read last, however they arrived.
  return [...groups.filter(g => g.day !== null), ...groups.filter(g => g.day === null)]
}

export function DayBandRow({ day, columns }: { day: number | null; columns: number }) {
  return (
    <tr className="bg-gray-50">
      <td colSpan={columns} className="px-4 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {day === null ? 'Whole trip' : `Day ${day}`}
      </td>
    </tr>
  )
}

export function DayBandBlock({ day, children }: { day: number | null; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide bg-gray-50 rounded px-2 py-1 mb-1">
        {day === null ? 'Whole trip' : `Day ${day}`}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}
