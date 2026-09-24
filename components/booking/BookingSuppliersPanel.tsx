'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { supplierBacking } from '@/lib/bookings/booking-suppliers'

// Who has to confirm what for this booking (booking_supplier_status). The
// list is filled from the itinerary when the booking is made; "Sync from
// itinerary" adds anything new. Mark each row as it is chased and confirmed —
// "Not needed" takes it out of the count (e.g. a ticket bought at the gate).

interface SupplierRow {
  id: string
  supplier_type: string
  supplier_name: string
  service_date: string | null
  service_description: string | null
  quoted_cost: number | null
  status: string
  confirmation_number: string | null
}

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'no_response', label: 'No response' },
  { value: 'cancelled', label: 'Not needed' },
]

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-50 text-blue-700',
  confirmed: 'bg-green-50 text-green-700',
  no_response: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-gray-50 text-gray-400 line-through',
}

export default function BookingSuppliersPanel({
  bookingId,
  currency,
  hasItinerary,
  canEdit,
  notify,
}: {
  bookingId: string
  currency: string
  hasItinerary: boolean
  canEdit: boolean
  notify: (type: 'success' | 'error' | 'info', message: string) => void
}) {
  const [rows, setRows] = useState<SupplierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/suppliers`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) setRows(data.data)
      else notify('error', data.error || 'Could not load the suppliers')
    } finally {
      setLoading(false)
    }
  // notify is the page's toast helper, recreated every render: keeping it
  // out of the deps stops a reload loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  useEffect(() => { load() }, [load])

  const sync = async () => {
    setSyncing(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/sync-suppliers`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { notify('error', data.error || 'Could not sync the suppliers'); return }
      notify(data.data?.added ? 'success' : 'info', data.message)
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const update = async (row: SupplierRow, patch: Partial<Pick<SupplierRow, 'status' | 'confirmation_number'>>) => {
    setSavingId(row.id)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...patch }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { notify('error', data.error || 'Could not update the supplier'); return }
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, ...data.data } : r)))
    } finally {
      setSavingId(null)
    }
  }

  const backing = supplierBacking(rows)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Suppliers</h3>
          <p className={`text-sm mt-0.5 flex items-center gap-1 ${backing.backed ? 'text-green-700' : 'text-gray-500'}`}>
            {backing.backed && <CheckCircle2 className="w-4 h-4" />}
            {backing.total === 0
              ? 'No suppliers listed yet'
              : `${backing.confirmed} of ${backing.total} confirmed`}
          </p>
        </div>
        {hasItinerary && canEdit && (
          <button
            onClick={sync}
            disabled={syncing}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync from itinerary
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">
          {hasItinerary ? 'Nothing listed — use “Sync from itinerary”.' : 'This booking has no itinerary to list suppliers from.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Supplier</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium text-right">Cost</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium">Confirmation no.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                    {r.service_date ? new Date(`${r.service_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-gray-900">{r.supplier_name}</td>
                  <td className="py-2 pr-3 text-gray-500 capitalize">{r.supplier_type}</td>
                  <td className="py-2 pr-3 text-right text-gray-700 whitespace-nowrap">
                    {r.quoted_cost != null ? `${currency} ${Number(r.quoted_cost).toFixed(2)}` : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      aria-label={`Status of ${r.supplier_name}`}
                      value={r.status}
                      disabled={!canEdit || savingId === r.id}
                      onChange={e => update(r, { status: e.target.value })}
                      // ! — globals.css gives every <select> width:100% and wide
                      // padding outside Tailwind's layers, crushing this pill.
                      className={`!w-32 !px-2 !py-1 rounded-md text-xs font-medium !border-0 ${STATUS_STYLE[r.status] ?? ''}`}
                    >
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2">
                    <input
                      aria-label={`Confirmation number for ${r.supplier_name}`}
                      defaultValue={r.confirmation_number ?? ''}
                      disabled={!canEdit}
                      onBlur={e => {
                        const v = e.target.value.trim()
                        if (v !== (r.confirmation_number ?? '')) update(r, { confirmation_number: v || null })
                      }}
                      placeholder="—"
                      className="!w-32 !px-2 !py-1 !text-xs border border-gray-200 rounded-md"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
