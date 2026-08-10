'use client'

import { useState, useEffect } from 'react'
import { UserCircle, Loader2, Check } from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  role: string | null
  is_active: boolean | null
}

interface AssigneeSelectProps {
  /** Current owner (team_members.id), or null when unassigned. */
  value: string | null
  /** Record endpoint to save to, e.g. `/api/bookings/abc123`. */
  endpoint: string
  /** Itineraries expose PUT; bookings expose PATCH. */
  method?: 'PUT' | 'PATCH'
  /** Fired after a successful save, with the new owner id. */
  onSaved?: (assigneeId: string | null) => void
  disabled?: boolean
  className?: string
}

/**
 * Owner picker for a trip (itinerary or booking) — migration 272.
 *
 * Saves on change rather than behind a form button: assignment is a one-field
 * decision and both detail pages already persist edits field-by-field. The
 * confirmation tick is transient; a failure leaves the select on its previous
 * value so the control never claims an owner the server rejected.
 */
export default function AssigneeSelect({
  value,
  endpoint,
  method = 'PATCH',
  onSaved,
  disabled = false,
  className = '',
}: AssigneeSelectProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [selected, setSelected] = useState<string | null>(value)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(value)
  }, [value])

  useEffect(() => {
    let cancelled = false

    const loadMembers = async () => {
      try {
        const response = await fetch('/api/team-members?active=true')
        const result = await response.json()
        if (!cancelled && result.success) {
          setMembers(result.data || [])
        }
      } catch {
        if (!cancelled) setError('Could not load the team list')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadMembers()
    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = async (next: string) => {
    const previous = selected
    const assigneeId = next || null

    setSelected(assigneeId)
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: assigneeId }),
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || result.success === false) {
        // Roll back so the control keeps showing what is actually stored.
        setSelected(previous)
        setError(result.error || 'Could not save the assignment')
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved?.(assigneeId)
    } catch {
      setSelected(previous)
      setError('Could not save the assignment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={className}>
      <label
        htmlFor={`assignee-${endpoint}`}
        className="text-sm text-gray-500 flex items-center gap-1.5"
      >
        <UserCircle className="w-4 h-4" />
        Assigned to
      </label>

      <div className="mt-1 flex items-center gap-2">
        <select
          id={`assignee-${endpoint}`}
          value={selected || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled || loading || saving}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2d3b2d]/20 focus:border-[#2d3b2d] disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">{loading ? 'Loading team…' : 'Unassigned'}</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
              {member.role ? ` · ${member.role}` : ''}
            </option>
          ))}
        </select>

        {saving && <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />}
        {saved && !saving && <Check className="w-4 h-4 text-green-600 shrink-0" />}
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

      {!loading && members.length === 0 && !error && (
        <p className="mt-1 text-sm text-gray-500">
          No active team members yet — add them in Settings → Team.
        </p>
      )}
    </div>
  )
}
