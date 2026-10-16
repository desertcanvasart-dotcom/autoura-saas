'use client'

import { useState } from 'react'
import { Download, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/app/supabase'
import { showToast } from '@/app/contexts/ToastContext'
import { downloadExport } from './download-export'

/**
 * Settings → Profile: a copy of your own data, and deleting your account
 * (privacy policy: access, deletion, portability). The rules for who can
 * delete are the server's (app/api/account): it explains a refusal.
 */
export default function YourDataCard({ email }: { email: string }) {
  const [exporting, setExporting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const exportMine = async () => {
    setExporting(true)
    const problem = await downloadExport('me')
    setExporting(false)
    if (problem) showToast('error', problem)
  }

  const deleteAccount = async () => {
    setDeleting(true)
    setRefusal(null)
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm_email: typed }),
      })
      const body = await res.json().catch(() => null) as { success?: boolean; error?: string } | null
      if (!res.ok || !body?.success) {
        setRefusal(body?.error || 'Your account could not be deleted. Please try again.')
        return
      }
      await createClient().auth.signOut().catch(() => undefined)
      window.location.assign('/?account=deleted')
    } finally {
      setDeleting(false)
    }
  }

  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-1">Your data</h3>
      <p className="text-xs text-gray-500 mb-3">
        Download a copy of your personal data, or delete your account.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportMine}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download my data
        </button>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete my account
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 border border-red-200 bg-red-50 rounded-lg p-3">
          <p className="text-sm text-red-800 mb-2">
            This deletes your login and personal settings straight away and cannot be undone.
            Work you did for your company stays with the company.
          </p>
          <label htmlFor="delete-account-confirm" className="block text-xs text-red-800 mb-1">
            Type <strong>{email}</strong> to confirm
          </label>
          <input
            id="delete-account-confirm"
            type="email"
            autoComplete="off"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-red-300 rounded-lg mb-2"
          />
          {refusal && <p role="alert" className="text-sm text-red-700 mb-2">{refusal}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={deleteAccount}
              disabled={!matches || deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete my account
            </button>
            <button
              type="button"
              onClick={() => { setConfirming(false); setTyped(''); setRefusal(null) }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
