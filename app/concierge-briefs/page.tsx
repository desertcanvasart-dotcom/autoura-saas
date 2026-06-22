'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ConciergeBell,
  Mail,
  Phone,
  Users,
  MapPin,
  CalendarDays,
  Sparkles,
  AlertTriangle,
  ExternalLink,
  Clock,
  Inbox,
} from 'lucide-react'

interface Brief {
  id: string
  conversation_id: string
  brief_revision: number
  language: string | null
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  preferred_contact: string | null
  travelers_count: number | null
  travelers_detail: string | null
  dates_specific: string | null
  dates_window: string | null
  trip_length_days: number | null
  origin_city: string | null
  nationality: string | null
  destinations: string[] | null
  comfort_level: string | null
  interests: string[] | null
  must_see: string[] | null
  must_avoid: string[] | null
  brief_summary: string | null
  constraint_dietary: string | null
  constraint_mobility: string | null
  constraint_religious: string | null
  constraint_medical: string | null
  review_status: string
  is_actionable: boolean
  flags: string[]
  client_id: string | null
  received_at: string
  committed_response_by: string | null
}

type StatusKey = 'needs_review' | 'in_progress' | 'responded' | 'archived'

const STATUS: Record<StatusKey, { label: string; badge: string; dot: string }> = {
  needs_review: { label: 'Needs Review', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  in_progress: { label: 'In Progress', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  responded: { label: 'Responded', badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  archived: { label: 'Archived', badge: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
}

const ACTIONS: Record<StatusKey, { to: StatusKey; label: string; primary?: boolean }[]> = {
  needs_review: [{ to: 'in_progress', label: 'Start review', primary: true }, { to: 'archived', label: 'Archive' }],
  in_progress: [{ to: 'responded', label: 'Mark responded', primary: true }, { to: 'archived', label: 'Archive' }],
  responded: [{ to: 'needs_review', label: 'Reopen' }, { to: 'archived', label: 'Archive' }],
  archived: [{ to: 'needs_review', label: 'Reopen', primary: true }],
}

const TABS: { key: 'all' | StatusKey; label: string }[] = [
  { key: 'needs_review', label: 'Needs Review' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'responded', label: 'Responded' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
]

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime()
  const mins = Math.floor((Date.now() - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ConciergeBriefsPage() {
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | StatusKey>('needs_review')
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchBriefs = useCallback(async () => {
    try {
      const res = await fetch('/api/concierge-briefs')
      if (res.ok) {
        const result = await res.json()
        if (result.success) setBriefs(result.data)
      }
    } catch (e) {
      console.error('Error fetching concierge briefs:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBriefs()
  }, [fetchBriefs])

  const updateStatus = async (id: string, to: StatusKey) => {
    setUpdating(id)
    try {
      const res = await fetch(`/api/concierge-briefs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: to }),
      })
      if (res.ok) {
        setBriefs(prev => prev.map(b => (b.id === id ? { ...b, review_status: to } : b)))
      }
    } catch (e) {
      console.error('Error updating brief:', e)
    } finally {
      setUpdating(null)
    }
  }

  const counts = briefs.reduce<Record<string, number>>((acc, b) => {
    acc[b.review_status] = (acc[b.review_status] || 0) + 1
    return acc
  }, {})

  const visible = tab === 'all' ? briefs : briefs.filter(b => b.review_status === tab)

  const tripDates = (b: Brief) =>
    b.dates_specific || b.dates_window || (b.trip_length_days ? `${b.trip_length_days} days` : null)

  const constraints = (b: Brief) =>
    [
      b.constraint_dietary && `Dietary: ${b.constraint_dietary}`,
      b.constraint_mobility && `Mobility: ${b.constraint_mobility}`,
      b.constraint_religious && `Religious: ${b.constraint_religious}`,
      b.constraint_medical && `Medical: ${b.constraint_medical}`,
    ].filter(Boolean) as string[]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center">
          <ConciergeBell className="h-5 w-5 text-[#647C47]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Concierge Leads</h1>
          <p className="text-sm text-gray-500">Planning briefs from the AI Concierge — triage and respond</p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {TABS.map(t => {
          const count = t.key === 'all' ? briefs.length : counts[t.key] || 0
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-[#647C47] text-[#647C47]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-[#647C47]/10 text-[#647C47]' : 'bg-gray-100 text-gray-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <Inbox className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No briefs in this view</p>
          <p className="text-xs text-gray-400 mt-1">
            Inbound briefs from the AI Concierge will appear here once the webhook receives them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(b => {
            const status = (STATUS[b.review_status as StatusKey] || STATUS.needs_review)
            const dates = tripDates(b)
            const cons = constraints(b)
            return (
              <div key={b.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: identity + facts */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {b.visitor_name || 'Concierge Lead'}
                      </h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${status.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                      {!b.is_actionable && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">
                          <AlertTriangle className="h-3 w-3" /> No contact
                        </span>
                      )}
                      {b.brief_revision > 1 && (
                        <span className="text-xs text-gray-400">rev {b.brief_revision}</span>
                      )}
                    </div>

                    {/* Contact */}
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                      {b.visitor_email && (
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{b.visitor_email}</span>
                      )}
                      {b.visitor_phone && (
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{b.visitor_phone}</span>
                      )}
                      <span className="flex items-center gap-1 text-gray-400"><Clock className="h-3 w-3" />{timeAgo(b.received_at)}</span>
                    </div>

                    {/* Trip facts */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600 flex-wrap">
                      {b.travelers_count != null && (
                        <span className="flex items-center gap-1"><Users className="h-3 w-3 text-gray-400" />{b.travelers_count}{b.travelers_detail ? ` (${b.travelers_detail})` : ''}</span>
                      )}
                      {dates && (
                        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3 text-gray-400" />{dates}</span>
                      )}
                      {b.destinations && b.destinations.length > 0 && (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3 text-gray-400" />{b.destinations.join(', ')}</span>
                      )}
                      {b.comfort_level && (
                        <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-gray-400" />{b.comfort_level}</span>
                      )}
                    </div>

                    {/* Summary */}
                    {b.brief_summary && (
                      <p className="mt-2 text-sm text-gray-700 line-clamp-3">{b.brief_summary}</p>
                    )}

                    {/* Interests + constraints */}
                    {(b.interests?.length || cons.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {b.interests?.map(i => (
                          <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-[#647C47]/10 text-[#647C47]">{i}</span>
                        ))}
                        {cons.map(c => (
                          <span key={c} className="px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-600">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {b.client_id && (
                      <Link
                        href={`/clients/${b.client_id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#647C47] hover:bg-[#647C47]/10 rounded-lg transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Client
                      </Link>
                    )}
                    <div className="flex flex-col items-stretch gap-1.5">
                      {(ACTIONS[b.review_status as StatusKey] || []).map(a => (
                        <button
                          key={a.to}
                          onClick={() => updateStatus(b.id, a.to)}
                          disabled={updating === b.id}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                            a.primary
                              ? 'bg-[#647C47] text-white hover:bg-[#4f6238]'
                              : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
