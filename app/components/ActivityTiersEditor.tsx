'use client'

// ============================================
// Group-size tier editor for activities (C3.3)
// ============================================
// A felucca or a camel ride costs less per person as the group grows. The
// bands come from the supplier's own sheet, so this is an add-as-many-as-you-
// need list rather than the two fixed slots the old B2B pricing rules had.
//
// Bands must not overlap and every band needs a real rate — the save refuses
// a set that breaks either rule rather than silently pricing at zero, so both
// are surfaced here before the operator submits.

import { useMemo } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { sanitizeTiers, type ActivityTier } from '@/lib/rates/activity-tiers'

function emptyTier(previous?: ActivityTier): ActivityTier {
  const min = previous ? previous.max_pax + 1 : 1
  return { min_pax: min, max_pax: min + 3, rate_eur: 0, rate_non_eur: null, label: null }
}

export default function ActivityTiersEditor({
  tiers,
  onChange,
  currencyLabel,
}: {
  tiers: ActivityTier[]
  onChange: (next: ActivityTier[]) => void
  currencyLabel?: string
}) {
  // sanitizeTiers is the same function the save path uses, so what it refuses
  // here is exactly what would be dropped on submit.
  const problem = useMemo(() => {
    if (tiers.length === 0) return null
    if (sanitizeTiers(tiers)) return null
    const sorted = [...tiers].sort((a, b) => a.max_pax - b.max_pax)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].min_pax <= sorted[i - 1].max_pax) {
        return `Bands overlap: ${sorted[i - 1].min_pax}-${sorted[i - 1].max_pax} and ${sorted[i].min_pax}-${sorted[i].max_pax}. Each band must start after the previous one ends.`
      }
    }
    if (tiers.some(t => !(t.rate_eur > 0))) return 'Every band needs a rate above zero.'
    if (tiers.some(t => t.max_pax < t.min_pax)) return 'A band cannot end below where it starts.'
    return 'These bands cannot be saved — check the numbers.'
  }, [tiers])

  const update = (i: number, patch: Partial<ActivityTier>) =>
    onChange(tiers.map((t, x) => (x === i ? { ...t, ...patch } : t)))

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Group-size bands</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            A per-person rate that changes with group size. A group larger than every band
            uses the last one.
            {tiers.length > 0 && ' Set the activity’s pricing type to "tiered" for these to be used.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange([...tiers, emptyTier(tiers[tiers.length - 1])])}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#647C47] rounded-md hover:bg-[#4f6238]"
        >
          <Plus className="w-3.5 h-3.5" /> Add band
        </button>
      </div>

      {tiers.length === 0 ? (
        <p className="text-xs text-gray-400">
          No bands — this activity prices from its flat rate.
        </p>
      ) : (
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">From pax</label>
                <input
                  type="number" min="1"
                  value={t.min_pax}
                  onChange={e => update(i, { min_pax: Number(e.target.value) || 1 })}
                  className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">To pax</label>
                <input
                  type="number" min="1"
                  value={t.max_pax}
                  onChange={e => update(i, { max_pax: Number(e.target.value) || 1 })}
                  className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">
                  Rate/pax{currencyLabel ? ` (${currencyLabel})` : ''}
                </label>
                <input
                  type="number" min="0" step="0.01"
                  value={t.rate_eur || ''}
                  onChange={e => update(i, { rate_eur: Number(e.target.value) || 0 })}
                  className="w-28 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="block text-[11px] text-gray-500 mb-1">Label (optional)</label>
                <input
                  value={t.label ?? ''}
                  onChange={e => update(i, { label: e.target.value || null })}
                  placeholder="e.g. Small boat"
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(tiers.filter((_, x) => x !== i))}
                className="p-1.5 text-gray-400 hover:text-red-600"
                title="Remove this band"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {problem && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-red-600">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{problem}</span>
        </p>
      )}
    </div>
  )
}
