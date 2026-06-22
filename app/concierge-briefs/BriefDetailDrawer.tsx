'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { X, ExternalLink, Loader2, MessageSquare, AlertTriangle } from 'lucide-react'
import { conciergeSla, type SlaLevel } from '@/lib/concierge-sla'

interface TranscriptMessage {
  role?: string
  content?: string
  timestamp?: string
}

interface FullBrief {
  id: string
  conversation_id: string
  session_id: string | null
  brief_revision: number
  language: string | null
  submitted_at: string | null
  received_at: string
  visitor_name: string | null
  visitor_email: string | null
  visitor_phone: string | null
  preferred_contact: string | null
  visitor_timezone: string | null
  travelers_count: number | null
  travelers_detail: string | null
  dates_specific: string | null
  dates_window: string | null
  trip_length_days: number | null
  origin_city: string | null
  nationality: string | null
  international_flights: boolean | null
  destinations: string[] | null
  comfort_level: string | null
  interests: string[] | null
  must_see: string[] | null
  must_avoid: string[] | null
  constraint_dietary: string | null
  constraint_mobility: string | null
  constraint_religious: string | null
  constraint_medical: string | null
  brief_summary: string | null
  full_transcript: TranscriptMessage[] | null
  committed_response_by: string | null
  cairo_time_label: string | null
  visitor_local_label: string | null
  client_id: string | null
  review_status: string
  is_actionable: boolean
  flags: string[]
}

type StatusKey = 'needs_review' | 'in_progress' | 'responded' | 'archived'

const STATUS_BADGE: Record<string, string> = {
  needs_review: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  responded: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<string, string> = {
  needs_review: 'Needs Review',
  in_progress: 'In Progress',
  responded: 'Responded',
  archived: 'Archived',
}

const ACTIONS: Record<StatusKey, { to: StatusKey; label: string; primary?: boolean }[]> = {
  needs_review: [{ to: 'in_progress', label: 'Start review', primary: true }, { to: 'archived', label: 'Archive' }],
  in_progress: [{ to: 'responded', label: 'Mark responded', primary: true }, { to: 'archived', label: 'Archive' }],
  responded: [{ to: 'needs_review', label: 'Reopen' }, { to: 'archived', label: 'Archive' }],
  archived: [{ to: 'needs_review', label: 'Reopen', primary: true }],
}

const SLA_BADGE: Record<SlaLevel, string> = {
  overdue: 'bg-red-100 text-red-700',
  soon: 'bg-amber-100 text-amber-700',
  ok: 'bg-emerald-100 text-emerald-700',
  met: 'bg-green-100 text-green-700',
  none: 'bg-gray-100 text-gray-500',
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-32 shrink-0 text-gray-400">{label}</span>
      <span className="text-gray-800">{Array.isArray(value) ? value.join(', ') : value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{title}</h4>
      {children}
    </div>
  )
}

interface Props {
  briefId: string
  onClose: () => void
  onStatusChange: (id: string, to: StatusKey) => Promise<void> | void
}

export default function BriefDetailDrawer({ briefId, onClose, onStatusChange }: Props) {
  const [brief, setBrief] = useState<FullBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/concierge-briefs/${briefId}`)
      if (res.ok) {
        const result = await res.json()
        if (result.success) setBrief(result.data)
      }
    } catch (e) {
      console.error('Error loading brief:', e)
    } finally {
      setLoading(false)
    }
  }, [briefId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const handleStatus = async (to: StatusKey) => {
    setUpdating(true)
    try {
      await onStatusChange(briefId, to)
      setBrief(prev => (prev ? { ...prev, review_status: to } : prev))
    } finally {
      setUpdating(false)
    }
  }

  const sla = brief ? conciergeSla(brief.committed_response_by, brief.review_status) : null
  const dates = brief && (brief.dates_specific || brief.dates_window || (brief.trip_length_days ? `${brief.trip_length_days} days` : null))

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {brief?.visitor_name || 'Concierge Lead'}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {brief && (
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[brief.review_status] || STATUS_BADGE.needs_review}`}>
                  {STATUS_LABEL[brief.review_status] || brief.review_status}
                </span>
              )}
              {sla && sla.level !== 'none' && (
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${SLA_BADGE[sla.level]}`}>
                  {sla.label}
                </span>
              )}
              {brief && !brief.is_actionable && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">
                  <AlertTriangle className="h-3 w-3" /> No contact
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-[#647C47] animate-spin" />
            </div>
          ) : !brief ? (
            <p className="text-sm text-gray-500 py-10 text-center">Brief not found.</p>
          ) : (
            <>
              {brief.brief_summary && (
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{brief.brief_summary}</p>
              )}

              <Section title="Contact">
                <Field label="Email" value={brief.visitor_email} />
                <Field label="Phone" value={brief.visitor_phone} />
                <Field label="Preferred" value={brief.preferred_contact} />
                <Field label="Timezone" value={brief.visitor_timezone} />
                <Field label="Nationality" value={brief.nationality} />
                <Field label="Language" value={brief.language} />
              </Section>

              <Section title="Trip">
                <Field label="Travelers" value={brief.travelers_count != null ? `${brief.travelers_count}${brief.travelers_detail ? ` (${brief.travelers_detail})` : ''}` : null} />
                <Field label="Dates" value={dates} />
                <Field label="Origin" value={brief.origin_city} />
                <Field label="Intl flights" value={brief.international_flights == null ? null : brief.international_flights ? 'Yes' : 'No'} />
              </Section>

              <Section title="Preferences">
                <Field label="Comfort" value={brief.comfort_level} />
                <Field label="Destinations" value={brief.destinations} />
                <Field label="Interests" value={brief.interests} />
                <Field label="Must see" value={brief.must_see} />
                <Field label="Must avoid" value={brief.must_avoid} />
              </Section>

              {(brief.constraint_dietary || brief.constraint_mobility || brief.constraint_religious || brief.constraint_medical) && (
                <Section title="Constraints">
                  <Field label="Dietary" value={brief.constraint_dietary} />
                  <Field label="Mobility" value={brief.constraint_mobility} />
                  <Field label="Religious" value={brief.constraint_religious} />
                  <Field label="Medical" value={brief.constraint_medical} />
                </Section>
              )}

              <Section title="Response window">
                <Field label="Committed by" value={brief.committed_response_by ? new Date(brief.committed_response_by).toLocaleString() : null} />
                <Field label="Cairo time" value={brief.cairo_time_label} />
                <Field label="Visitor time" value={brief.visitor_local_label} />
                <Field label="Received" value={new Date(brief.received_at).toLocaleString()} />
              </Section>

              {/* Transcript */}
              <Section title={`Transcript${brief.full_transcript?.length ? ` (${brief.full_transcript.length})` : ''}`}>
                {brief.full_transcript && brief.full_transcript.length > 0 ? (
                  <div className="space-y-2 mt-1">
                    {brief.full_transcript.map((m, i) => {
                      const visitorSide = ['user', 'visitor', 'human'].includes((m.role || '').toLowerCase())
                      return (
                        <div key={i} className={`flex ${visitorSide ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${visitorSide ? 'bg-[#647C47]/10 text-gray-800' : 'bg-gray-100 text-gray-700'}`}>
                            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{m.role || 'message'}</div>
                            <div className="whitespace-pre-wrap">{m.content}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> No transcript captured</p>
                )}
              </Section>

              <Section title="Meta">
                <Field label="Conversation" value={brief.conversation_id} />
                <Field label="Revision" value={String(brief.brief_revision)} />
                {brief.flags.length > 0 && <Field label="Flags" value={brief.flags} />}
              </Section>
            </>
          )}
        </div>

        {/* Footer actions */}
        {brief && (
          <div className="border-t border-gray-200 px-5 py-3 flex items-center justify-between gap-2 shrink-0">
            {brief.client_id ? (
              <Link href={`/clients/${brief.client_id}`} className="inline-flex items-center gap-1 text-sm text-[#647C47] hover:underline">
                <ExternalLink className="h-4 w-4" /> View client
              </Link>
            ) : <span />}
            <div className="flex items-center gap-2">
              {(ACTIONS[brief.review_status as StatusKey] || []).map(a => (
                <button
                  key={a.to}
                  onClick={() => handleStatus(a.to)}
                  disabled={updating}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    a.primary ? 'bg-[#647C47] text-white hover:bg-[#4f6238]' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
