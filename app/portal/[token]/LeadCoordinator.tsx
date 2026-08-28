'use client'

// The lead's coordinator panel (booking-level link only): mint each
// traveller's PRIVATE link and email it, or copy the URL to share directly.
// Private links demand that traveller's name + date of birth at the gate, so
// forwarding the family link stops being the only option.

import { useState } from 'react'
import type { PortalTraveller } from './TravellerForm'

export default function LeadCoordinator({ token, travellers }: { token: string; travellers: PortalTraveller[] }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, { url: string; sent: boolean }>>({})
  const [error, setError] = useState<string | null>(null)

  const mint = async (passengerId: string, send: boolean) => {
    if (busyId) return
    setBusyId(passengerId)
    setError(null)
    try {
      const res = await fetch(`/api/portal/${token}/coordinator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passenger_id: passengerId, send }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setResults(r => ({ ...r, [passengerId]: { url: data.url, sent: data.sent } }))
        if (!send) {
          try { await navigator.clipboard.writeText(data.url) } catch { /* url still shown */ }
        }
      } else {
        setError(data.error || 'Could not create the link.')
      }
    } catch {
      setError('Could not create the link.')
    } finally {
      setBusyId(null)
    }
  }

  const others = travellers.filter(t => !t.is_lead_passenger)
  if (others.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-gray-900">Invite your co-travellers</h2>
      <p className="mt-1 text-xs text-gray-500">
        Each traveller can get a private link to fill in their own details. It asks for their
        family name and date of birth, so only they can open it.
      </p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <ul className="mt-3 divide-y divide-gray-100">
        {others.map(t => {
          const name = [t.first_name, t.last_name].filter(Boolean).join(' ') || 'Traveller'
          const r = results[t.id]
          return (
            <li key={t.id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">{name}</p>
                {r && (
                  <p className="text-[11px] text-gray-400 truncate">
                    {r.sent ? 'Link emailed' : 'Link copied'} · {r.url}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {t.email && (
                  <button
                    onClick={() => mint(t.id, true)}
                    disabled={busyId !== null}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-[#647C47] rounded-md hover:bg-[#4f6238] disabled:opacity-50"
                  >
                    {busyId === t.id ? '…' : 'Email link'}
                  </button>
                )}
                <button
                  onClick={() => mint(t.id, false)}
                  disabled={busyId !== null}
                  className="px-2.5 py-1 text-xs font-medium text-[#647C47] border border-[#647C47]/40 rounded-md hover:bg-[#647C47]/5 disabled:opacity-50"
                >
                  Copy link
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
