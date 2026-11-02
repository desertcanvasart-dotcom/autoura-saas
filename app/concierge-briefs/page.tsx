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
  Eye,
  Trash2,
  MessageCircle,
  Globe,
  Star,
} from 'lucide-react'
import BriefDetailDrawer from './BriefDetailDrawer'
import { conciergeSla, type SlaLevel } from '@/lib/concierge-sla'
import { requestBadgeRefresh } from '@/lib/use-inbox-unread'
import { useRole } from '@/hooks/useRole'
import { useConfirmDialog } from '@/components/ConfirmDialog'
import { showToast } from '@/app/contexts/ToastContext'
import { normalizeClientStage, clientStageBadge, clientStageLabel } from '@/lib/client-stage'

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
  client: { status: string | null } | null
  received_at: string
  committed_response_by: string | null
}

// A person filed as a client by email sync, the WhatsApp webhook or the
// website form (GET /api/leads) — no brief, just who they are and the
// conversation they came from.
interface ClientLead {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  status: string | null
  client_source: 'email' | 'whatsapp' | 'website'
  notes: string | null
  created_at: string
  conversation_id: string | null
  last_message_preview: string | null
  last_message_at: string | null
}

type SourceKey = 'all' | 'concierge' | 'email' | 'whatsapp' | 'website'
type StageKey = 'lead' | 'active' | 'all'

const SOURCES: { key: SourceKey; label: string; icon?: typeof Mail }[] = [
  { key: 'all', label: 'All sources' },
  { key: 'concierge', label: 'AI Concierge', icon: ConciergeBell },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'website', label: 'Website', icon: Globe },
]

const SOURCE_TAG: Record<Exclude<SourceKey, 'all'>, { label: string; icon: typeof Mail }> = {
  concierge: { label: 'AI Concierge', icon: ConciergeBell },
  email: { label: 'Email', icon: Mail },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  website: { label: 'Website', icon: Globe },
}

// Lead → Customer is the client's stage (lib/client-stage): a first booking
// promotes them, in the database. A brief with no client yet is a lead.
const STAGES: { key: StageKey; label: string }[] = [
  { key: 'lead', label: 'Leads' },
  { key: 'active', label: 'Became customers' },
  { key: 'all', label: 'Everyone' },
]

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

const SLA_BADGE: Record<SlaLevel, string> = {
  overdue: 'bg-red-100 text-red-700',
  soon: 'bg-amber-100 text-amber-700',
  ok: 'bg-primary-100 text-primary-700',
  met: 'bg-green-100 text-green-700',
  none: 'bg-gray-100 text-gray-500',
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

function SourceTag({ k }: { k: Exclude<SourceKey, 'all'> }) {
  const t = SOURCE_TAG[k]
  const Icon = t.icon
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
      <Icon className="h-3 w-3" /> {t.label}
    </span>
  )
}

function StageBadge({ status }: { status: string | null | undefined }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${clientStageBadge(status)}`}>
      {normalizeClientStage(status) === 'active' && <Star className="h-3 w-3" />}
      {clientStageLabel(status)}
    </span>
  )
}

export default function ConciergeBriefsPage() {
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [clientLeads, setClientLeads] = useState<ClientLead[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<SourceKey>('all')
  const [stage, setStage] = useState<StageKey>('lead')
  const [tab, setTab] = useState<'all' | StatusKey>('needs_review')
  const [updating, setUpdating] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const { isAdmin, isManager } = useRole()
  const canDelete = isAdmin || isManager
  const { confirm } = useConfirmDialog()

  const fetchBriefs = useCallback(async () => {
    try {
      const [briefRes, leadRes] = await Promise.all([fetch('/api/concierge-briefs'), fetch('/api/leads')])
      if (briefRes.ok) {
        const result = await briefRes.json()
        if (result.success) setBriefs(result.data)
      }
      if (leadRes.ok) {
        const result = await leadRes.json()
        if (result.success) setClientLeads(result.data)
      }
    } catch (e) {
      console.error('Error fetching leads:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBriefs()
  }, [fetchBriefs])

  // Says so when it fails. It used to ignore a failed PATCH, so Archive
  // (refused by a missing database policy, migration 386) looked like a
  // button that did nothing.
  const updateStatus = async (id: string, to: StatusKey): Promise<boolean> => {
    setUpdating(id)
    try {
      const res = await fetch(`/api/concierge-briefs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_status: to }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast('error', data.error || 'Could not update the lead')
        return false
      }
      setBriefs(prev => prev.map(b => (b.id === id ? { ...b, review_status: to } : b)))
      requestBadgeRefresh() // the sidebar's "needs review" count follows now
      if (to === 'archived') showToast('success', 'Lead archived — find it under AI Concierge → Archived')
      return true
    } catch (e) {
      console.error('Error updating brief:', e)
      showToast('error', 'Could not update the lead')
      return false
    } finally {
      setUpdating(null)
    }
  }

  // Permanent removal — test enquiries, spam. Manager and above, from any
  // tab, after a confirm.
  const deleteBrief = async (id: string): Promise<boolean> => {
    const lead = briefs.find(b => b.id === id)
    const ok = await confirm({
      title: 'Delete this lead permanently?',
      message: `${lead?.visitor_name || 'This lead'} will be removed for good, with its conversation history. The CRM client it created stays in Clients.`,
      confirmText: 'Delete permanently',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (!ok) return false
    setUpdating(id)
    try {
      const res = await fetch(`/api/concierge-briefs/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        showToast('error', data.error || 'Could not delete the lead')
        return false
      }
      setBriefs(prev => prev.filter(b => b.id !== id))
      if (detailId === id) setDetailId(null)
      requestBadgeRefresh()
      showToast('success', 'Lead deleted')
      return true
    } catch (e) {
      console.error('Error deleting brief:', e)
      showToast('error', 'Could not delete the lead')
      return false
    } finally {
      setUpdating(null)
    }
  }

  // An email/WhatsApp/website lead is a client record, so removing it is the
  // client delete (its own guards: nothing booked, quoted or invoiced). The
  // conversation stays in the Inbox, unlinked. For email the sender is also
  // remembered as "not a lead" (migration 368), or the next sync would read
  // their mail the same way and file them again.
  const deleteClientLead = async (lead: ClientLead) => {
    const name = lead.full_name || lead.email || lead.phone || 'This lead'
    const fromEmail = lead.client_source === 'email' && lead.email
    const ok = await confirm({
      title: 'Delete this lead?',
      message: fromEmail
        ? `${name} will be removed from Clients, and mail from ${lead.email} won't be read as a trip request again. The conversation stays in the Inbox.`
        : `${name} will be removed from Clients. The conversation stays in the Inbox.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    })
    if (!ok) return
    setUpdating(lead.id)
    try {
      if (fromEmail) {
        const res = await fetch('/api/email/leads/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender_email: lead.email, reason: 'Deleted from the Leads page' }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          showToast('error', data.error || 'Could not delete the lead')
          return
        }
      }
      const res = await fetch(`/api/clients/${lead.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        showToast('error', data.error || 'Could not delete the lead')
        return
      }
      setClientLeads(prev => prev.filter(l => l.id !== lead.id))
      showToast('success', 'Lead deleted')
    } catch (e) {
      console.error('Error deleting lead:', e)
      showToast('error', 'Could not delete the lead')
    } finally {
      setUpdating(null)
    }
  }

  const briefStage = (b: Brief) => normalizeClientStage(b.client?.status)
  const stageMatches = (s: string) => stage === 'all' || s === stage

  // A triaged-away (archived) brief is not a live lead: it shows only under
  // AI Concierge → Archived.
  const liveBriefs = briefs.filter(b => b.review_status !== 'archived')
  const inSource = (key: SourceKey) => {
    const fromBriefs = key === 'all' || key === 'concierge' ? liveBriefs : []
    const fromClients = key === 'all' ? clientLeads : key === 'concierge' ? [] : clientLeads.filter(l => l.client_source === key)
    return { fromBriefs, fromClients }
  }
  const countFor = (key: SourceKey, st: StageKey) => {
    const { fromBriefs, fromClients } = inSource(key)
    const ok = (s: string) => st === 'all' || s === st
    return fromBriefs.filter(b => ok(briefStage(b))).length +
      fromClients.filter(l => ok(normalizeClientStage(l.status))).length
  }

  // Review tabs belong to the concierge's triage, so they show only there.
  const conciergeBriefs = briefs.filter(b => stageMatches(briefStage(b)))
  const counts = conciergeBriefs.reduce<Record<string, number>>((acc, b) => {
    acc[b.review_status] = (acc[b.review_status] || 0) + 1
    return acc
  }, {})

  type Row = { kind: 'brief'; at: string; brief: Brief } | { kind: 'client'; at: string; lead: ClientLead }
  const rows: Row[] = (() => {
    if (source === 'concierge') {
      return conciergeBriefs
        .filter(b => tab === 'all' || b.review_status === tab)
        .map(b => ({ kind: 'brief' as const, at: b.received_at, brief: b }))
    }
    const { fromBriefs, fromClients } = inSource(source)
    return [
      ...fromBriefs.filter(b => stageMatches(briefStage(b))).map(b => ({ kind: 'brief' as const, at: b.received_at, brief: b })),
      ...fromClients
        .filter(l => stageMatches(normalizeClientStage(l.status)))
        .map(l => ({ kind: 'client' as const, at: l.last_message_at || l.created_at, lead: l })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  })()

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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
      active
        ? 'bg-primary-500 border-primary-500 text-white'
        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
    }`
  const chipCount = (active: boolean) =>
    `px-1.5 rounded-full text-xs ${active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`

  const renderBrief = (b: Brief) => {
    const status = (STATUS[b.review_status as StatusKey] || STATUS.needs_review)
    const dates = tripDates(b)
    const cons = constraints(b)
    return (
      <div key={`b-${b.id}`} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          {/* Left: identity + facts */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900">
                {b.visitor_name || 'Concierge Lead'}
              </h3>
              <StageBadge status={b.client?.status} />
              <SourceTag k="concierge" />
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
              {(() => {
                const sla = conciergeSla(b.committed_response_by, b.review_status)
                return sla.level === 'overdue' || sla.level === 'soon' || sla.level === 'ok' ? (
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${SLA_BADGE[sla.level]}`}>{sla.label}</span>
                ) : null
              })()}
            </div>

            {/* Contact */}
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
              {b.visitor_email && (
                <span className="flex items-center gap-1 break-all"><Mail className="h-3 w-3" />{b.visitor_email}</span>
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
                  <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-primary-500/10 text-primary-500">{i}</span>
                ))}
                {cons.map(c => (
                  <span key={c} className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-600">{c}</span>
                ))}
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex flex-row flex-wrap sm:flex-col items-center sm:items-end gap-2 shrink-0">
            <button
              onClick={() => setDetailId(b.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Eye className="h-3.5 w-3.5" /> Details
            </button>
            {b.client_id && (
              <Link
                href={`/clients/${b.client_id}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary-500 hover:bg-primary-500/10 rounded-lg transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Client
              </Link>
            )}
            <div className="flex flex-row flex-wrap sm:flex-col items-stretch gap-1.5">
              {(ACTIONS[b.review_status as StatusKey] || []).map(a => (
                <button
                  key={a.to}
                  onClick={() => updateStatus(b.id, a.to)}
                  disabled={updating === b.id}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    a.primary
                      ? 'bg-primary-500 text-white hover:bg-primary-700'
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {a.label}
                </button>
              ))}
              {canDelete && (
                <button
                  onClick={() => deleteBrief(b.id)}
                  disabled={updating === b.id}
                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderClientLead = (l: ClientLead) => {
    const phone = l.whatsapp || l.phone
    const customer = normalizeClientStage(l.status) === 'active'
    return (
      <div key={`c-${l.id}`} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900">{l.full_name || l.email || phone || 'Lead'}</h3>
              <StageBadge status={l.status} />
              <SourceTag k={l.client_source} />
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
              {l.email && <span className="flex items-center gap-1 break-all"><Mail className="h-3 w-3" />{l.email}</span>}
              {phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{phone}</span>}
              <span className="flex items-center gap-1 text-gray-400"><Clock className="h-3 w-3" />{timeAgo(l.last_message_at || l.created_at)}</span>
            </div>
            {l.last_message_preview && (
              <p className="mt-2 text-sm text-gray-700 line-clamp-2">{l.last_message_preview}</p>
            )}
          </div>
          <div className="flex flex-row flex-wrap sm:flex-col items-center sm:items-end gap-2 shrink-0">
            {l.conversation_id && (
              <Link
                href={`/inbox?id=${l.conversation_id}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Inbox className="h-3.5 w-3.5" /> Conversation
              </Link>
            )}
            <Link
              href={`/clients/${l.id}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-primary-500 hover:bg-primary-500/10 rounded-lg transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Client
            </Link>
            {canDelete && !customer && (
              <button
                onClick={() => deleteClientLead(l)}
                disabled={updating === l.id}
                className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-500/10 rounded-lg flex items-center justify-center shrink-0">
          <Star className="h-5 w-5 text-primary-500" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500">
            Everyone who asked about a trip — AI Concierge, email, WhatsApp and your website. A first booking makes them a customer.
          </p>
        </div>
      </div>

      {/* Filters: where they came from, and how far they got */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {SOURCES.map(s => {
            const active = source === s.key
            const Icon = s.icon
            return (
              <button key={s.key} onClick={() => setSource(s.key)} className={chip(active)}>
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {s.label}
                <span className={chipCount(active)}>{countFor(s.key, stage)}</span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          {STAGES.map(st => {
            const active = stage === st.key
            return (
              <button key={st.key} onClick={() => setStage(st.key)} className={chip(active)}>
                {st.label}
                <span className={chipCount(active)}>{countFor(source, st.key)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Concierge triage tabs */}
      {source === 'concierge' && (
        <div className="flex flex-wrap gap-2 border-b border-gray-200">
          {TABS.map(t => {
            const count = t.key === 'all' ? conciergeBriefs.length : counts[t.key] || 0
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-primary-500 text-primary-500'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-primary-500/10 text-primary-500' : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* List */}
      {rows.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
          <Inbox className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{stage === 'active' ? 'No customers here yet' : 'No leads in this view'}</p>
          <p className="text-xs text-gray-400 mt-1">
            {stage === 'active'
              ? 'A lead becomes a customer when their first booking is made.'
              : 'New trip requests from the AI Concierge, email, WhatsApp and your website appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (r.kind === 'brief' ? renderBrief(r.brief) : renderClientLead(r.lead)))}
        </div>
      )}

      {detailId && (
        <BriefDetailDrawer
          briefId={detailId}
          onClose={() => setDetailId(null)}
          onStatusChange={updateStatus}
          onDelete={canDelete ? deleteBrief : undefined}
        />
      )}
    </div>
  )
}
