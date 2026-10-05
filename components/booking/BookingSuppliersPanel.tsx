'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { supplierBacking } from '@/lib/bookings/booking-suppliers'

// Who has to confirm what for this booking (booking_supplier_status). The
// list is filled from the itinerary when the booking is made; "Sync from
// itinerary" adds anything new. Mark each row as it is chased and confirmed —
// "Not needed" takes it out of the count (e.g. a ticket bought at the gate).
// Confirming a row with a cost records it as a pending expense (what the trip
// owes that supplier); the Expense column links to it.

interface SupplierRow {
  id: string
  supplier_type: string
  supplier_name: string
  service_date: string | null
  service_description: string | null
  quoted_cost: number | null
  confirmed_cost: number | null
  status: string
  confirmation_number: string | null
  expense: { id: string; expense_number: string; status: string } | null
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

  const update = async (row: SupplierRow, patch: Partial<Pick<SupplierRow, 'status' | 'confirmation_number' | 'confirmed_cost'>>) => {
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
      const exp = data.data?.expense as SupplierRow['expense']
      if (data.expense_error) notify('error', data.expense_error)
      else if (data.expense_action === 'create' && exp) notify('success', `Expense ${exp.expense_number} recorded for ${row.supplier_name}`)
      else if (data.expense_action === 'update' && exp) notify('info', `Expense ${exp.expense_number} updated`)
      else if (data.expense_action === 'remove') notify('info', `Pending expense for ${row.supplier_name} removed`)
      else if (data.expense_action === 'kept' && exp && (patch.status !== undefined || patch.confirmed_cost !== undefined)) {
        notify('info', `Expense ${exp.expense_number} is already ${exp.status} — change it on the Expenses page`)
      }
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
                <th className="py-2 pr-3 font-medium">Confirmation no.</th>
                <th className="py-2 font-medium">Expense</th>
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
                    {canEdit ? (
                      // The cost the supplier confirmed (defaults to the quote);
                      // it is what the expense records.
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs text-gray-400">{currency}</span>
                        <input
                          key={`${r.id}:${r.confirmed_cost ?? ''}`}
                          aria-label={`Confirmed cost for ${r.supplier_name}`}
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={r.confirmed_cost ?? r.quoted_cost ?? ''}
                          disabled={savingId === r.id}
                          onBlur={e => {
                            const raw = e.target.value.trim()
                            const v = raw === '' ? null : Math.round(Number(raw) * 100) / 100
                            if (v !== null && !Number.isFinite(v)) return
                            const current = r.confirmed_cost ?? r.quoted_cost ?? null
                            if (v !== (current === null ? null : Number(current))) update(r, { confirmed_cost: v })
                          }}
                          className="!w-24 !px-2 !py-1 !text-xs text-right border border-gray-200 rounded-md"
                        />
                      </span>
                    ) : (r.confirmed_cost ?? r.quoted_cost) != null ? `${currency} ${Number(r.confirmed_cost ?? r.quoted_cost).toFixed(2)}` : '—'}
                    {r.confirmed_cost != null && r.quoted_cost != null && Number(r.confirmed_cost) !== Number(r.quoted_cost) && (
                      <div className="text-[10px] text-gray-400">quoted {Number(r.quoted_cost).toFixed(2)}</div>
                    )}
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
                  <td className="py-2 pr-3">
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
                  <td className="py-2 whitespace-nowrap text-xs">
                    {r.expense ? (
                      <Link href={`/expenses/${r.expense.id}`} className="text-[#647C47] hover:underline">
                        {r.expense.expense_number}
                        <span className="text-gray-400 capitalize"> · {r.expense.status}</span>
                      </Link>
                    ) : <span className="text-gray-300">—</span>}
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
