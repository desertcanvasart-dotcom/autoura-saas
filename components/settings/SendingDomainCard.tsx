'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

type DnsRecord = { record?: string; name?: string; type?: string; value?: string; priority?: number; status?: string }
type DomainState = {
  domain: string | null
  status: string | null
  sending_as?: string
  will_send_as?: string | null
}

/**
 * Settings → Email: send client email from the company's own domain
 * (invoices@theiragency.com) instead of the platform address. The server
 * side (app/api/settings/email-domain) was complete — claim, DNS records,
 * verify — but no page called it, so every company sent as the platform.
 */
export default function SendingDomainCard({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<DomainState | null>(null)
  const [domain, setDomain] = useState('')
  const [fromLocal, setFromLocal] = useState('invoices')
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async () => {
    const res = await fetch('/api/settings/email-domain').catch(() => null)
    const data = res && res.ok ? await res.json().catch(() => null) : null
    if (data?.success) setState(data)
  }
  useEffect(() => { load() }, [])

  const call = async (method: 'POST' | 'PUT' | 'DELETE', body?: unknown) => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings/email-domain', {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setMessage({ ok: false, text: data.error || 'That did not work. Please try again.' })
        return
      }
      if (Array.isArray(data.dns_records)) setRecords(data.dns_records)
      if (data.message) setMessage({ ok: Boolean(data.verified), text: data.message })
      if (method === 'DELETE') setRecords([])
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null
  const configured = Boolean(state.domain) && state.status !== 'not_configured'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Sending domain</h2>
      <p className="text-sm text-gray-600 mb-3">
        Quotes, invoices and reminders go out as <strong>{state.sending_as || 'the platform address'}</strong>.
        {!configured && ' Send them from your own domain instead, so clients see your name and replies reach you.'}
      </p>

      {configured ? (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-medium">{state.domain}</span>{' '}
            <span className={`ml-1 px-2 py-0.5 rounded text-xs ${state.status === 'verified' ? 'bg-green-100 text-green-800' : state.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
              {state.status === 'verified' ? 'Verified' : state.status === 'failed' ? 'Verification failed' : 'Waiting for DNS'}
            </span>
          </p>
          {state.status !== 'verified' && state.will_send_as && (
            <p className="text-xs text-gray-500">Once verified, mail goes out as {state.will_send_as}.</p>
          )}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {state.status !== 'verified' && (
                <button type="button" disabled={busy} onClick={() => call('PUT')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-[#263A29] rounded-lg disabled:opacity-50">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Check DNS now
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => call('DELETE')}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                Stop using this domain
              </button>
            </div>
          )}
        </div>
      ) : canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs text-gray-600 mb-1">Address</span>
            <input value={fromLocal} onChange={e => setFromLocal(e.target.value)} aria-label="Address before the @"
              className="w-32 px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </label>
          <span className="pb-2 text-sm text-gray-500">@</span>
          <label className="text-sm flex-1 min-w-[10rem]">
            <span className="block text-xs text-gray-600 mb-1">Your domain</span>
            <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="youragency.com" aria-label="Your domain"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
          </label>
          <button type="button" disabled={busy || !domain.trim()} onClick={() => call('POST', { domain, from_local: fromLocal })}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-[#263A29] rounded-lg disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Set up
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-500">An owner or admin can set up your own sending domain.</p>
      )}

      {records.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-700 mb-2">
            Add these records at your domain provider, then press <strong>Check DNS now</strong>. Changes can take up to 72 hours;
            mail keeps going out from the platform address until then.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200">
              <thead className="bg-gray-50">
                <tr><th className="p-2 text-left">Type</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Value</th><th className="p-2 text-left">Priority</th></tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-t border-gray-200 align-top">
                    <td className="p-2">{r.type}</td>
                    <td className="p-2 font-mono break-all">{r.name}</td>
                    <td className="p-2 font-mono break-all">{r.value}</td>
                    <td className="p-2">{r.priority ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {message && (
        <p role="status" className={`mt-3 text-sm ${message.ok ? 'text-green-700' : 'text-amber-800'}`}>{message.text}</p>
      )}
    </div>
  )
}
