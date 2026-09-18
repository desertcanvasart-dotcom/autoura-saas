'use client'

import { ratePeriodLines, type RateSeasonEntity } from '@/lib/rates/rate-seasons'

// ============================================
// Every rate period, on its own line
// ============================================
// The hotel list showed today's period and the peak as two bare numbers, and
// the cruise list showed the raw base columns — so the periods an operator had
// typed from a contract were invisible in the list, and a period with a blank
// nightly rate (stored as 0) looked exactly like a priced one. Those blanks
// are what the engine refuses to price, so the list says so.

export function RatePeriodLines({
  row,
  entity,
  formatRate,
}: {
  row: object
  entity: RateSeasonEntity
  /** Renders a number in the row's own currency. */
  formatRate: (value: number) => string
}) {
  const lines = ratePeriodLines(row, entity)
  if (lines.length === 0) {
    return <p className="text-xs text-gray-400">No rate periods — add one to price a dated night.</p>
  }

  return (
    <div className="space-y-1">
      {lines.map((line, i) => (
        <div
          key={`${line.from}-${line.to}-${i}`}
          className={`flex items-baseline justify-between gap-2 text-xs ${
            line.current ? 'font-medium text-gray-900' : 'text-gray-600'
          }`}
        >
          <span className="min-w-0 truncate">
            {line.name}
            <span className="text-gray-400">
              {' '}
              {line.from} → {line.to}
            </span>
          </span>
          {line.blank ? (
            <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
              No rate
            </span>
          ) : (
            <span className="shrink-0 tabular-nums">
              {formatRate(line.eur as number)}
              {line.nonEur != null && line.nonEur !== line.eur ? (
                <span className="text-gray-400"> / {formatRate(line.nonEur)}</span>
              ) : null}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
