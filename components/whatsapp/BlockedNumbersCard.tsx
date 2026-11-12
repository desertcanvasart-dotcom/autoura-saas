'use client'
// Settings → WhatsApp: the numbers this company blocked (migration 465).
// Everyone sees the list; owners, admins and managers block and unblock.
import { useState } from 'react'
import { Ban, Loader2 } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { showToast } from '@/app/contexts/ToastContext'
import { useBlockedNumbers } from './useBlockedNumbers'

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

export default function BlockedNumbersCard() {
  const { canAccess } = useRole()
  const canEdit = canAccess(['admin', 'manager'])
  const { blocked, loading, error, block, unblock } = useBlockedNumbers()
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const add = async () => {
    if (!phone.trim()) return
    setBusy('add')
    const r = await block(phone, reason)
    setBusy(null)
    if (r.ok) { setPhone(''); setReason(''); showToast('success', 'Number blocked') }
    else showToast('error', r.error)
  }

  const remove = async (number: string) => {
    setBusy(number)
    const r = await unblock(number)
    setBusy(null)
    if (r.ok) showToast('success', `${number} unblocked`)
    else showToast('error', r.error)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-2">
        <Ban className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">Blocked numbers</h2>
      </div>
      <p className="text-xs text-gray-600 mb-4">
        Messages from a blocked number are ignored: they don&rsquo;t appear in the inbox, don&rsquo;t ring the bell,
        aren&rsquo;t added as leads and get no AI reply. This blocks inside Autoura only — the sender can still
        send to your WhatsApp number.
      </p>

      {canEdit && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+20 100 123 4567"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
            aria-label="Number to block"
          />
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
            aria-label="Reason"
          />
          <button
            onClick={add}
            disabled={!phone.trim() || busy === 'add'}
            className="px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}Block
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : blocked.length === 0 ? (
        <p className="text-xs text-gray-500">No numbers are blocked.</p>
      ) : (
        <div>
          {blocked.map(b => (
            <div key={b.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{b.phone_number}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  Blocked {when(b.created_at)}
                  {b.reason ? ` · ${b.reason}` : ''}
                  {b.blocked_message_count > 0
                    ? ` · ${b.blocked_message_count} message${b.blocked_message_count === 1 ? '' : 's'} ignored, last ${when(b.last_blocked_at)}`
                    : ''}
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(b.phone_number)}
                  disabled={busy === b.phone_number}
                  className="px-2.5 py-1 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === b.phone_number ? 'Unblocking…' : 'Unblock'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
