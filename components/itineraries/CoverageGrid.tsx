'use client'

// Who covers each day: resource types × days, read from the service lines and
// the assignments (lib/itineraries/coverage). Only the types this trip uses;
// a day that needs someone and has nobody is dashed amber, a day that needs
// nobody is a plain dash — so "missing" and "not needed" no longer look alike.

import type { CoverageRow } from '@/lib/itineraries/coverage'

interface Props {
  rows: CoverageRow[]
  days: { day: number; date: string | null; city?: string | null }[]
}

const shortDate = (d: string | null) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

export default function CoverageGrid({ rows, days }: Props) {
  if (rows.length === 0 || days.length === 0) return null
  const missing = rows.reduce((n, r) => n + r.missing.length, 0)

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Coverage</h3>
          <p className="text-xs text-gray-500">What each day needs, from its services, and who is assigned.</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${missing ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
          {missing ? `${missing} gap${missing === 1 ? '' : 's'}` : 'All covered'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-medium px-4 py-2 sticky left-0 bg-white">Resource</th>
              {days.map(d => (
                <th key={d.day} className="font-medium px-2 py-2 text-center whitespace-nowrap" title={d.city ?? undefined}>
                  <div>Day {d.day}</div>
                  <div className="font-normal text-gray-400">{shortDate(d.date)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.type} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-700 whitespace-nowrap sticky left-0 bg-white">{r.label}</td>
                {r.cells.map(c => (
                  <td key={c.day} className="px-1 py-1.5 text-center">
                    {c.state === 'assigned' ? (
                      <span className="inline-block max-w-[9rem] truncate rounded bg-green-50 text-green-800 border border-green-200 px-1.5 py-0.5" title={c.names.join(', ')}>
                        {c.names.join(', ')}
                      </span>
                    ) : c.state === 'missing' ? (
                      <span className="inline-block rounded border border-dashed border-amber-400 bg-amber-50 text-amber-800 px-1.5 py-0.5">Needed</span>
                    ) : (
                      <span className="text-gray-300" title="Not needed this day">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
