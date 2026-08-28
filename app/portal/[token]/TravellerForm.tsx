'use client'

// One traveller's details, editable in place. Sends only the fields the
// server's allow-list accepts (lib/booking-portal PASSENGER_WRITABLE_FIELDS).

import { useState } from 'react'
import TravellerDocuments from './TravellerDocuments'

export interface PortalTraveller {
  id: string
  title: string | null
  first_name: string | null
  last_name: string | null
  date_of_birth: string | null
  gender: string | null
  nationality: string | null
  email: string | null
  phone: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  passport_number: string | null
  passport_expiry: string | null
  passport_issuing_country: string | null
  meal_preference: string | null
  mobility_requirements: string | null
  medical_conditions: string | null
  special_requests: string | null
  passenger_type: string | null
  is_lead_passenger: boolean | null
}

const FIELDS: Array<{ key: keyof PortalTraveller; label: string; type?: string; span?: boolean }> = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Family name' },
  { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'passport_number', label: 'Passport number' },
  { key: 'passport_expiry', label: 'Passport expiry', type: 'date' },
  { key: 'passport_issuing_country', label: 'Passport issuing country' },
  { key: 'emergency_contact_name', label: 'Emergency contact name' },
  { key: 'emergency_contact_phone', label: 'Emergency contact phone', type: 'tel' },
  { key: 'meal_preference', label: 'Meal preference' },
  { key: 'mobility_requirements', label: 'Mobility requirements', span: true },
  { key: 'medical_conditions', label: 'Medical conditions (shared only as needed)', span: true },
  { key: 'special_requests', label: 'Special requests', span: true },
]

export default function TravellerForm({
  token,
  traveller,
  locked,
  onSaved,
}: {
  token: string
  traveller: PortalTraveller
  locked: boolean
  onSaved: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const f of FIELDS) v[f.key] = (traveller[f.key] as string | null) ?? ''
    return v
  })
  const [open, setOpen] = useState(!traveller.passport_number) // incomplete = open
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const displayName =
    [traveller.first_name, traveller.last_name].filter(Boolean).join(' ') || 'Traveller'

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || locked) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/portal/${token}/travellers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: traveller.id, ...values }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setNotice({ ok: true, text: 'Saved — thank you!' })
        onSaved()
      } else {
        setNotice({ ok: false, text: data.error || 'Could not save. Please try again.' })
      }
    } catch {
      setNotice({ ok: false, text: 'Could not save. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-gray-900">
          {displayName}
          {traveller.is_lead_passenger && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-[#4a5c35] bg-[#647C47]/10 border border-[#647C47]/30 rounded px-1.5 py-0.5">lead</span>
          )}
        </span>
        <span className="text-xs text-gray-400">
          {traveller.passport_number ? 'Details on file' : 'Details needed'} {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <form onSubmit={save} className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map(f => (
            <div key={f.key} className={f.span ? 'sm:col-span-2' : undefined}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
              <input
                type={f.type ?? 'text'}
                value={values[f.key]}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                disabled={locked}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#647C47] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          ))}
          {notice && (
            <p className={`sm:col-span-2 text-xs ${notice.ok ? 'text-green-700' : 'text-red-600'}`}>{notice.text}</p>
          )}
          {!locked && (
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save details'}
              </button>
            </div>
          )}
          <div className="sm:col-span-2">
            <TravellerDocuments token={token} passengerId={traveller.id} locked={locked} />
          </div>
        </form>
      )}
    </div>
  )
}
