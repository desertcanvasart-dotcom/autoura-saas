'use client'

// ============================================
// Portal content behind the gate (C1a)
// ============================================
// Loads the travellers the LINK is scoped to and renders their forms; on a
// booking-level link the lead also gets the coordinator panel for minting
// each traveller's private link.

import { useCallback, useEffect, useState } from 'react'
import TravellerForm, { type PortalTraveller } from './TravellerForm'
import LeadCoordinator from './LeadCoordinator'
import ChangeRequestForm from './ChangeRequestForm'

export default function PortalContent({ token, scope }: { token: string; scope: 'traveller' | 'booking' }) {
  const [travellers, setTravellers] = useState<PortalTraveller[]>([])
  const [formLocked, setFormLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/${token}/travellers`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setTravellers(data.travellers)
        setFormLocked(!!data.form_locked)
      } else {
        setError('Could not load traveller details.')
      }
    } catch {
      setError('Could not load traveller details.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  if (loading) return <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
  if (error) return <p className="text-sm text-red-600 py-6 text-center">{error}</p>

  return (
    <div className="space-y-4">
      {formLocked && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          Traveller details are confirmed and locked. Contact your agency for any changes.
        </div>
      )}

      {travellers.map(t => (
        <TravellerForm key={t.id} token={token} traveller={t} locked={formLocked} onSaved={load} />
      ))}

      {scope === 'booking' && travellers.length > 1 && (
        <LeadCoordinator token={token} travellers={travellers} />
      )}

      {scope === 'booking' && <ChangeRequestForm token={token} />}
    </div>
  )
}
