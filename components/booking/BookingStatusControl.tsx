'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { statusChoiceOf, type OperatorStatusChoice } from '@/lib/bookings/booking-status'

// The booking's status, set by the operator (lib/bookings/booking-status.ts).
// "Active" hands it back to the payments; In progress / Completed need the
// suppliers confirmed — or an explicit "go ahead anyway", which is recorded.

const CHOICES: { value: OperatorStatusChoice; label: string }[] = [
  { value: 'active', label: 'Active (follows payments)' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export interface StatusOverride {
  to?: string
  email?: string | null
  at?: string
  confirmed?: number
  total?: number
}

export default function BookingStatusControl({
  bookingId,
  status,
  override,
  canEdit,
  onChanged,
  notify,
}: {
  bookingId: string
  status: string
  override?: StatusOverride | null
  canEdit: boolean
  onChanged: () => void
  notify: (type: 'success' | 'error' | 'info', message: string) => void
}) {
  const { confirm } = useConfirmDialog()
  const [saving, setSaving] = useState(false)
  const current = statusChoiceOf(status)

  const send = async (to: OperatorStatusChoice, ack: boolean) => {
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: to, ...(ack ? { status_override_ack: true } : {}) }),
    })
    return { res, data: await res.json().catch(() => ({})) }
  }

  const change = async (to: OperatorStatusChoice) => {
    if (to === current) return
    if (to === 'cancelled') {
      const ok = await confirm({
        title: 'Cancel this booking?',
        message: 'The booking is marked cancelled. Payments stay recorded; choose Active later to reopen it.',
        confirmText: 'Cancel booking',
        cancelText: 'Keep it',
        variant: 'danger',
      })
      if (!ok) return
    }
    setSaving(true)
    try {
      let { res, data } = await send(to, false)
      if (res.status === 409 && data.code === 'supplier_status_unbacked') {
        const ok = await confirm({
          title: 'Suppliers not all confirmed',
          message: `${data.error} Going ahead is recorded with your name.`,
          confirmText: 'Go ahead anyway',
          cancelText: 'Back',
          variant: 'warning',
        })
        if (!ok) return
        ;({ res, data } = await send(to, true))
      }
      if (!res.ok || !data.success) {
        notify('error', data.error || 'Could not change the status')
        return
      }
      notify('success', 'Status updated')
      onChanged()
    } catch {
      notify('error', 'Could not change the status')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        <select
          aria-label="Booking status"
          value={current}
          disabled={!canEdit || saving}
          onChange={e => change(e.target.value as OperatorStatusChoice)}
          className="!w-auto !px-3 !py-1.5 text-sm border border-gray-300 rounded-lg bg-white disabled:bg-gray-50 disabled:text-gray-500"
          title={canEdit ? 'Change the booking status' : 'Only a manager or admin can change the status'}
        >
          {CHOICES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      {override?.at && (
        <p className="flex items-center gap-1 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" />
          Moved on with {override.confirmed ?? 0} of {override.total ?? 0} suppliers confirmed
          {override.email ? ` — ${override.email}` : ''}, {new Date(override.at).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}
