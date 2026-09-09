'use client'

// ============================================
// Dated rate periods editor (C3.2b)
// ============================================
// The entry surface for the `seasons` model (migration 305). A contract
// carries as many dated windows as it carries — so this is a free-text-named
// list of up to SIX periods rather than three fixed Low/High/Peak slots
// (every agency cuts its seasons differently).
//
// It warns about overlaps and gaps instead of forbidding them: overlap is
// legal and normal (a Christmas window inside a broad winter one, where the
// SHORTEST window wins at pricing time), but it is also exactly how a typo
// looks. A gap is legal too — those dates fall back to the base rate — and
// almost never intended.

import { useMemo } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import {
  MAX_RATE_PERIODS,
  RATE_FIELDS,
  overlappingSeasons,
  seasonGaps,
  type RateSeason,
  type RateSeasonEntity,
} from '@/lib/rates/rate-seasons'

const FIELD_LABELS: Record<string, string> = {
  guide_rate_eur: 'Guide Bed / Night',
  ppd_eur: 'PPD',
  single_supplement_eur: 'Single supp',
  triple_reduction_eur: 'Triple red',
  ppd_non_eur: 'PPD (non-EU)',
  single_supplement_non_eur: 'Single supp (non-EU)',
  triple_reduction_non_eur: 'Triple red (non-EU)',
}

function emptyPeriod(entity: RateSeasonEntity): RateSeason {
  const rates: Record<string, number> = {}
  for (const f of RATE_FIELDS[entity]) rates[f] = 0
  return { name: '', from: '', to: '', rates }
}

export { MAX_RATE_PERIODS } // re-export for existing importers

export default function RatePeriodsEditor({
  entity,
  periods,
  onChange,
  currencyLabel,
}: {
  entity: RateSeasonEntity
  periods: RateSeason[]
  onChange: (next: RateSeason[]) => void
  /** What the amounts are denominated in — the rate's own currency. */
  currencyLabel?: string
}) {
  const complete = useMemo(() => periods.filter(p => p.from && p.to), [periods])
  const overlaps = useMemo(() => overlappingSeasons(complete), [complete])
  const gaps = useMemo(() => seasonGaps(complete), [complete])

  const update = (index: number, patch: Partial<RateSeason>) => {
    onChange(periods.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }
  const updateRate = (index: number, field: string, value: string) => {
    onChange(periods.map((p, i) =>
      i === index ? { ...p, rates: { ...p.rates, [field]: value === '' ? 0 : Number(value) } } : p
    ))
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Contract periods</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            One row per dated window in the contract, with real dates including the year.
            Name each one whatever your contract calls it — up to {MAX_RATE_PERIODS} periods. When a
            departure falls in two overlapping windows the <strong>shorter</strong> one is used, so a
            Christmas window inside a winter one works the way a contract reads.
            {periods.length > 0 && ' The default rate below is used only for dates no period covers.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...periods, emptyPeriod(entity)])}
          disabled={periods.length >= MAX_RATE_PERIODS}
          title={periods.length >= MAX_RATE_PERIODS ? `Up to ${MAX_RATE_PERIODS} periods per rate` : undefined}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#647C47] rounded-md hover:bg-[#4f6238] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" /> Add period
        </button>
      </div>

      {periods.length === 0 ? (
        <p className="text-xs text-gray-400">
          No periods yet — this rate prices from the default rate below for every date.
        </p>
      ) : (
        <div className="space-y-3">
          {periods.map((p, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3">
              <div className="flex flex-wrap items-end gap-2 mb-2">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    value={p.name}
                    onChange={e => update(i, { name: e.target.value })}
                    placeholder="e.g. Christmas"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                  <input
                    type="date"
                    value={p.from}
                    onChange={e => update(i, { from: e.target.value })}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                  <input
                    type="date"
                    value={p.to}
                    onChange={e => update(i, { to: e.target.value })}
                    className="px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onChange(periods.filter((_, x) => x !== i))}
                  className="p-1.5 text-gray-400 hover:text-red-600"
                  title="Remove this period"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {p.from && p.to && p.to < p.from && (
                <p className="text-xs text-red-600 mb-2">
                  The end date is before the start date — this period will not be saved.
                </p>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {RATE_FIELDS[entity].map(field => (
                  <div key={field}>
                    <label className="block text-[11px] text-gray-500 mb-1">
                      {FIELD_LABELS[field] ?? field}
                      {currencyLabel ? ` (${currencyLabel})` : ''}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={p.rates[field] ?? 0}
                      onChange={e => updateRate(i, field, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(overlaps.length > 0 || gaps.length > 0) && (
        <div className="mt-3 space-y-1">
          {overlaps.map(([a, b]) => (
            <p key={`o-${a}-${b}`} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                &ldquo;{complete[a]?.name || `Period ${a + 1}`}&rdquo; and &ldquo;{complete[b]?.name || `Period ${b + 1}`}&rdquo; overlap.
                That is allowed — the shorter window wins — but check the dates are what you meant.
              </span>
            </p>
          ))}
          {gaps.map(g => (
            <p key={`g-${g.from}`} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                No period covers {g.from} → {g.to}. Departures in that range fall back to the
                base rate below.
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
