'use client'

// ============================================
// The preferred star — "use THIS one when several fit"
// ============================================
// One star per rate row. Filled = this row is the engine's default among the
// hotels / ships / restaurants of the same city and tier; starring it clears
// the star on its siblings (one per scope, migration 354). With no star and
// several candidates the engine refuses to guess and reports a hole — the
// star is the one-click way to close that hole.

import { useState } from 'react'
import { Star } from 'lucide-react'
import type { PreferredTable } from '@/lib/rates/preferred'

export interface PreferredToggleResult {
  ok: boolean
  preferred: boolean
  /** e.g. "Steigenberger" */
  name?: string | null
  /** e.g. "Cairo · standard" */
  scope?: string
  error?: string
}

interface PreferredStarProps {
  table: PreferredTable
  id: string
  preferred: boolean | null | undefined
  /** Called after the request completes — refetch and toast here. */
  onToggled: (result: PreferredToggleResult) => void
  className?: string
}

export default function PreferredStar({ table, id, preferred, onToggled, className }: PreferredStarProps) {
  const [busy, setBusy] = useState(false)
  const on = preferred === true

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/rates/preferred', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, id, preferred: !on }),
      })
      const data = await res.json()
      onToggled(data.success
        ? { ok: true, preferred: !on, name: data.name, scope: data.scope }
        : { ok: false, preferred: on, error: data.error || 'Could not update' })
    } catch {
      onToggled({ ok: false, preferred: on, error: 'Could not update' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      title={on
        ? 'Preferred — the engine uses this one when several fit. Click to clear.'
        : 'Mark as preferred: the engine uses this one when several hotels/ships/restaurants fit the same city and tier.'}
      className={`p-1.5 rounded transition-colors disabled:opacity-50 ${on ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:text-amber-500 hover:bg-amber-50'} ${className || ''}`}
    >
      <Star className={`w-4 h-4 ${on ? 'fill-amber-500' : ''}`} />
    </button>
  )
}
