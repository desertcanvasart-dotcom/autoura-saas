'use client'

import { useEffect, useState } from 'react'
import { Download, AlertTriangle, Loader2 } from 'lucide-react'
import { showToast } from '@/app/contexts/ToastContext'
import { downloadExport } from './download-export'

type Closure = { requested_at: string; purge_after: string } | null

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Settings → Company: export everything the company holds (owners and
 * admins), and close the company (owners). Closing schedules deletion 30 days
 * out (Terms 6.3) and can be undone until then; the server enforces who may
 * do what (app/api/account/*).
 */
export default function CompanyDataCard({ companyName, role }: { companyName: string; role: string | null | undefined }) {
  const isOwner = role === 'owner'
  const canExport = role === 'owner' || role === 'admin'
  const [closure, setClosure] = useState<Closure>(null)
  const [exporting, setExporting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/account/company')
      .then(r => r.json())
      .then(b => { if (b?.success) setClosure(b.data ?? null) })
      .catch(() => undefined)
  }, [])

  if (!canExport) return null

  const exportCompany = async () => {
    setExporting(true)
    const problem = await downloadExport('company')
    setExporting(false)
    if (problem) showToast('error', problem)
  }

  const close = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/account/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_name: typed }),
      })
      const body = await res.json().catch(() => null) as { success?: boolean; error?: string; data?: Closure; billing_warning?: string | null } | null
      if (!res.ok || !body?.success) {
        showToast('error', body?.error || 'The company could not be closed. Please try again.')
        return
      }
      setClosure(body.data ?? null)
      setConfirming(false)
      setTyped('')
      showToast('success', 'Company closure scheduled.')
      if (body.billing_warning) showToast('error', body.billing_warning)
    } finally {
      setBusy(false)
    }
  }

  const reopen = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/account/company', { method: 'DELETE' })
      const body = await res.json().catch(() => null) as { success?: boolean; error?: string; billing_warning?: string | null } | null
      if (!res.ok || !body?.success) {
        showToast('error', body?.error || 'The closure could not be cancelled. Please try again.')
        return
      }
      setClosure(null)
      showToast('success', 'Closure cancelled — your company stays open.')
      if (body.billing_warning) showToast('error', body.billing_warning)
    } finally {
      setBusy(false)
    }
  }

  const matches = typed.trim().toLowerCase() === companyName.trim().toLowerCase()

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Company data</h2>
      <p className="text-sm text-gray-500 mb-4">
        Download everything {companyName} holds in Autoura — clients, trips, quotes, bookings, invoices,
        suppliers and rates — as spreadsheets (CSV) and JSON.
      </p>
      <button
        type="button"
        onClick={exportCompany}
        disabled={exporting}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
      >
        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {exporting ? 'Preparing export…' : 'Export company data'}
      </button>

      {closure ? (
        <div role="status" className="mt-5 border border-red-200 bg-red-50 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            This company will be deleted on {formatDate(closure.purge_after)}.
          </p>
          <p className="text-sm text-red-700 mt-1">
            Until then everything keeps working, and you can export your data. After that date all of
            the company&apos;s data and files are permanently deleted.
          </p>
          {isOwner && (
            <button
              type="button"
              onClick={reopen}
              disabled={busy}
              className="mt-3 px-3 py-1.5 text-sm border border-red-300 rounded-lg bg-white hover:bg-red-100 disabled:opacity-50"
            >
              Keep the company open
            </button>
          )}
        </div>
      ) : isOwner && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          <h3 className="text-sm font-semibold text-red-700 mb-1">Close company</h3>
          <p className="text-sm text-gray-500 mb-3">
            Stops your subscription renewing and deletes all of the company&apos;s data 30 days later.
            You can change your mind until then.
          </p>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="px-3 py-1.5 text-sm text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
            >
              Close company…
            </button>
          ) : (
            <div className="border border-red-200 bg-red-50 rounded-lg p-3">
              <label htmlFor="close-company-confirm" className="block text-xs text-red-800 mb-1">
                Type <strong>{companyName}</strong> to confirm
              </label>
              <input
                id="close-company-confirm"
                type="text"
                autoComplete="off"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-red-300 rounded-lg mb-2"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={!matches || busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Close company
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirming(false); setTyped('') }}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
