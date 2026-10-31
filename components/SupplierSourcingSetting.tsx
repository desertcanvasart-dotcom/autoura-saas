'use client'

import { useEffect, useState } from 'react'
import { SOURCING, SOURCING_LABEL, type Sourcing } from '@/lib/supplier-network'

// Settings › Supplier network: where this agency books suppliers from (Phase 3,
// decision §7: one setting per agency; own suppliers come first). Changing it
// never touches suppliers already on the list.

const HINT: Record<Sourcing, string> = {
  own: 'Only the suppliers you add yourself. The network search is hidden.',
  network: 'Find verified suppliers in the Autoura network and add them. Your own cars, guides and staff always stay available.',
  both: 'Your own suppliers first, plus the Autoura network when you need more.',
}

export default function SupplierSourcingSetting({ canEdit }: { canEdit: boolean }) {
  const [value, setValue] = useState<Sourcing | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // A failed read used to render nothing, so the setting looked missing.
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/supplier-sourcing')
      .then(r => r.json())
      .then(d => {
        if (d.success) setValue(d.data.sourcing)
        else setLoadError(d.error || 'Could not load the supplier sourcing setting')
      })
      .catch(() => setLoadError('Could not load the supplier sourcing setting'))
  }, [])

  const save = async (v: Sourcing) => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/settings/supplier-sourcing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourcing: v }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) { setMsg(d.error || 'Could not save'); return }
      setValue(v); setMsg('Saved')
    } finally { setBusy(false) }
  }

  if (!value) {
    return (
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900">Supplier sourcing</h2>
        <p className={`text-sm mt-1 ${loadError ? 'text-red-600' : 'text-gray-500'}`}>{loadError ?? 'Loading…'}</p>
      </section>
    )
  }
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-900">Supplier sourcing</h2>
      <p className="text-sm text-gray-600 mt-0.5">Where your agency books suppliers from.</p>
      <div className="mt-3 space-y-2">
        {SOURCING.map(s => (
          <label key={s} className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${value === s ? 'border-primary-500 bg-primary-50' : 'border-gray-200'} ${canEdit ? 'cursor-pointer' : 'opacity-70'}`}>
            <input type="radio" name="supplier_sourcing" checked={value === s} disabled={!canEdit || busy} onChange={() => save(s)} className="mt-0.5" />
            <span><b className="text-gray-900">{SOURCING_LABEL[s]}</b><br /><span className="text-gray-600">{HINT[s]}</span></span>
          </label>
        ))}
      </div>
      {!canEdit && <p className="mt-2 text-xs text-gray-500">Only owners and admins can change this.</p>}
      {msg && <p className="mt-2 text-xs text-gray-600">{msg}</p>}
    </section>
  )
}
