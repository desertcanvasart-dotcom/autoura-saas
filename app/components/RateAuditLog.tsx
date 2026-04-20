'use client'

import { useState, useEffect } from 'react'
import { History, ChevronDown, ChevronUp, ArrowRight, Clock, User } from 'lucide-react'


interface AuditEntry {
  id: string
  table_name: string
  record_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  changed_fields: Record<string, { old: any; new: any }> | null
  changed_by: string | null
  changed_at: string
}

interface RateAuditLogProps {
  tableName: string
  recordId: string
}

const ACTION_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  INSERT: { label: 'Created', bg: 'bg-green-100', text: 'text-green-700' },
  UPDATE: { label: 'Updated', bg: 'bg-blue-100', text: 'text-blue-700' },
  DELETE: { label: 'Deleted', bg: 'bg-red-100', text: 'text-red-700' },
}

/**
 * Format a field value for display.
 * Handles null, numbers, booleans, and strings.
 */
function formatValue(val: any): string {
  if (val === null || val === undefined) return '(empty)'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'number') return val.toLocaleString()
  if (typeof val === 'string' && val.length > 80) return val.substring(0, 80) + '...'
  return String(val)
}

/**
 * Make a field name human-readable:
 * "rate_high_double_eur" -> "Rate High Double EUR"
 */
function humanizeField(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bEur\b/g, 'EUR')
    .replace(/\bNon Eur\b/g, 'Non-EUR')
}

export default function RateAuditLog({ tableName, recordId }: RateAuditLogProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (expanded && entries.length === 0) {
      fetchAuditLog()
    }
  }, [expanded])

  const fetchAuditLog = async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/rates/audit-log?table_name=${tableName}&record_id=${recordId}&limit=50`
      )
      const data = await res.json()
      if (data.success) {
        setEntries(data.data)
      }
    } catch (err) {
      console.error('Failed to fetch audit log:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleEntry = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Change History</span>
          {entries.length > 0 && (
            <span className="text-xs text-gray-400">({entries.length} changes)</span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-200">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-400">Loading history...</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">No changes recorded yet</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {entries.map((entry) => {
                const badge = ACTION_BADGES[entry.action] || ACTION_BADGES.UPDATE
                const isEntryExpanded = expandedEntries.has(entry.id)
                const changedCount = entry.changed_fields
                  ? Object.keys(entry.changed_fields).length
                  : 0

                return (
                  <div key={entry.id} className="bg-white">
                    <button
                      type="button"
                      onClick={() => toggleEntry(entry.id)}
                      className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(entry.changed_at)}</span>
                        </div>
                        {changedCount > 0 && (
                          <span className="text-xs text-gray-400">
                            {changedCount} field{changedCount !== 1 ? 's' : ''} changed
                          </span>
                        )}
                      </div>
                      {changedCount > 0 && (
                        isEntryExpanded
                          ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </button>

                    {isEntryExpanded && entry.changed_fields && (
                      <div className="px-4 pb-3">
                        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                          {Object.entries(entry.changed_fields).map(([field, change]) => (
                            <div key={field} className="flex items-start gap-2 text-xs">
                              <span className="font-medium text-gray-600 min-w-[140px] shrink-0">
                                {humanizeField(field)}
                              </span>
                              <span className="text-red-500 line-through">
                                {formatValue(change.old)}
                              </span>
                              <ArrowRight className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                              <span className="text-green-600 font-medium">
                                {formatValue(change.new)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
