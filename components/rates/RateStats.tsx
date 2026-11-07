// The summary figures at the top of a rate sheet, as one compact strip
// (2026-11-07). Each page used five tall cards with an icon, a coloured dot,
// a label and a number; the strip says the same in a third of the height.

import type { ReactNode } from 'react'

export interface RateStat {
  label: string
  value: ReactNode
  /** Colour of the figure; default is near-black. */
  tone?: 'default' | 'green' | 'amber' | 'blue' | 'primary'
}

const TONE: Record<NonNullable<RateStat['tone']>, string> = {
  default: 'text-gray-900',
  green: 'text-green-700',
  amber: 'text-amber-700',
  blue: 'text-blue-700',
  primary: 'text-primary-700',
}

export default function RateStats({ stats }: { stats: RateStat[] }) {
  return (
    <dl className="mb-4 grid grid-cols-2 sm:grid-cols-3 lg:flex lg:divide-x divide-gray-200 bg-white border border-gray-200 rounded-lg shadow-sm">
      {stats.map(s => (
        <div key={s.label} className="lg:flex-1 px-4 py-2.5 min-w-0">
          <dt className="truncate text-xs text-gray-500">{s.label}</dt>
          <dd className={`text-lg font-semibold tabular-nums ${TONE[s.tone ?? 'default']}`}>{s.value}</dd>
        </div>
      ))}
    </dl>
  )
}
