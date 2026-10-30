'use client'

import { useState } from 'react'
import { Loader2, UserCheck } from 'lucide-react'

// Who covers one service line: one of the agency's own people or cars
// (assigned at once, with a warning when they are booked elsewhere that day),
// or a supplier to request from — with what the line costs at that supplier,
// or no cost when they have no rate for this service (then type in what they
// agreed). Options come from /api/bookings/[id]/suppliers/[lineId]/cover.

interface OwnOption { resource_type: string; resource_id: string; name: string; detail: string | null; day_off?: boolean }
interface SupplierOption { supplier_id: string; name: string; cost: number | null; no_cost_reason: string | null; preferred?: boolean; day_off?: boolean; other?: boolean }
interface Options { can_change: boolean; own: OwnOption[]; suppliers: SupplierOption[]; compares_rates: boolean }

const OWN_KIND: Record<string, string> = {
  vehicle: 'Car', driver: 'Driver', guide: 'Guide', airport_staff: 'Airport staff', hotel_staff: 'Hotel staff',
}

export default function CoverLinePicker({
  bookingId,
  lineId,
  currency,
  onSaved,
  notify,
}: {
  bookingId: string
  lineId: string
  currency: string
  onSaved: () => void
  notify: (type: 'success' | 'error' | 'info', message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<Options | null>(null)
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)

  const url = `/api/bookings/${bookingId}/suppliers/${lineId}/cover`

  const toggle = async () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    setChoice('')
    setOptions(null)
    const res = await fetch(url)
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) setOptions(data.data)
    else { notify('error', data.error || 'Could not load who can cover this'); setOpen(false) }
  }

  const save = async () => {
    const [kind, a, b] = choice.split('|')
    if (!kind) return
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'own' ? { kind, resource_type: a, resource_id: b } : { kind, supplier_id: a }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { notify('error', data.error || 'Could not save'); return }
      if (data.clashes?.length) {
        notify('info', `Assigned — note: also booked on ${data.clashes.map((c: { conflicting_itinerary: string }) => c.conflicting_itinerary).join(', ')} that day`)
      } else if (data.no_cost_reason) {
        notify('info', `Supplier set — no cost yet (${data.no_cost_reason}). Enter what they agreed.`)
      } else {
        notify('success', kind === 'own' ? 'Assigned' : 'Supplier set')
      }
      setOpen(false)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
      >
        <UserCheck className="w-3.5 h-3.5" /> Who covers it
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-left">
          {!options ? (
            <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</p>
          ) : !options.can_change ? (
            <p className="text-xs text-gray-600">Move the line back to <b>To arrange</b> first to change who covers it.</p>
          ) : options.own.length === 0 && options.suppliers.length === 0 ? (
            <p className="text-xs text-gray-600">
              Nobody to offer: no own people or cars, and no supplier of this kind in your supplier book.
              Add one under CRM → Suppliers.
            </p>
          ) : (
            <>
              <select
                aria-label="Who covers this line"
                value={choice}
                onChange={e => setChoice(e.target.value)}
                className="!text-xs !py-1.5"
              >
                <option value="">Choose…</option>
                {options.own.length > 0 && (
                  <optgroup label="Assign directly (your team and cars)">
                    {options.own.map(o => (
                      <option key={`${o.resource_type}:${o.resource_id}`} value={`own|${o.resource_type}|${o.resource_id}`}>
                        {OWN_KIND[o.resource_type] ?? o.resource_type}: {o.name}{o.detail ? ` · ${o.detail}` : ''}{o.day_off ? ' · ⚠ day off' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {options.suppliers.some(s => !s.other) && (
                  <optgroup label="Suppliers with a rate for this">
                    {options.suppliers.filter(s => !s.other).map(s => (
                      <option key={s.supplier_id} value={`supplier|${s.supplier_id}`}>
                        {s.preferred ? '★ ' : ''}{s.name} — {s.cost !== null ? `${currency} ${s.cost.toFixed(2)}` : 'no rate'}{s.day_off ? ' · ⚠ day off' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {options.suppliers.some(s => s.other) && (
                  <optgroup label="Other suppliers of this kind (no rate — enter what they agree)">
                    {options.suppliers.filter(s => s.other).map(s => (
                      <option key={s.supplier_id} value={`supplier|${s.supplier_id}`}>
                        {s.name}{s.day_off ? ' · ⚠ day off' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="px-2 py-1 text-xs text-gray-600">Cancel</button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!choice || busy}
                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 text-white disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
