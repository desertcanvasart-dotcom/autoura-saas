// ============================================
// What a client write may set, and how it is checked
// ============================================
// The client pages wrote straight to the table from the browser and the API
// wrote whatever body it was sent, so any column — tenant-adjacent flags, the
// booking counters the database keeps — could be set, and nothing checked a
// passport type or an email. This is the list the client forms edit, checked,
// for the API routes. Lives here so it can be tested.

import { SUPPORTED_CURRENCIES } from '@/lib/currency'
import { CLIENT_STAGES, normalizeClientStage } from '@/lib/client-stage'
import type { TablesUpdate } from '@/types/database.types'

/** Where a client came from. `lead_source` is what the pages show and set;
 *  automatic writers (WhatsApp, email, concierge) set `client_source`, so a
 *  client with no lead source shows that instead (clientLeadSource). */
export const LEAD_SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬', color: 'bg-green-100 text-green-700' },
  { value: 'email', label: 'Email', icon: '✉️', color: 'bg-blue-100 text-blue-700' },
  { value: 'website', label: 'Website', icon: '🌐', color: 'bg-purple-100 text-purple-700' },
  { value: 'referral', label: 'Referral', icon: '👥', color: 'bg-orange-100 text-orange-700' },
  { value: 'phone', label: 'Phone', icon: '📞', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'social_media', label: 'Social Media', icon: '📱', color: 'bg-pink-100 text-pink-700' },
  { value: 'trade_show', label: 'Trade Show', icon: '🎪', color: 'bg-amber-100 text-amber-700' },
  { value: 'partner', label: 'Partner', icon: '🤝', color: 'bg-teal-100 text-teal-700' },
  { value: 'concierge', label: 'Concierge', icon: '🛎️', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'other', label: 'Other', icon: '➕', color: 'bg-gray-100 text-gray-700' },
] as const

/** client_source's CHECK (migration 129) plus concierge. */
const CLIENT_SOURCES = ['direct', 'referral', 'website', 'social_media', 'whatsapp', 'email', 'partner', 'concierge', 'other']

/** The lead source a row shows: its own, else the source an automatic writer
 *  recorded ('direct' is the column default, not a source anyone chose). */
export function clientLeadSource(row: { lead_source?: string | null; client_source?: string | null }): string | null {
  if (row.lead_source) return row.lead_source
  return row.client_source && row.client_source !== 'direct' ? row.client_source : null
}

/** The forms offer these two; the older words are still accepted (migration 411). */
export const PASSPORT_TYPES = ['euro_passport', 'other_passport', 'normal', 'diplomatic', 'service', 'official', 'other']
export const CLIENT_TYPES = ['individual', 'family', 'group', 'corporate', 'agent']

const TEXT = [
  'first_name', 'last_name', 'email', 'phone', 'whatsapp', 'alternative_phone', 'nationality',
  'preferred_language', 'country', 'city', 'address', 'address_line1', 'address_line2', 'postal_code',
  'preferred_contact_method', 'best_time_to_contact', 'timezone', 'preferred_accommodation_level',
  'company_name', 'job_title', 'internal_notes', 'notes',
] as const
const LISTS = ['dietary_restrictions', 'accessibility_needs', 'special_interests', 'tags'] as const
const FLAGS = ['vip_status', 'is_travel_agent', 'marketing_consent', 'newsletter_subscribed', 'sms_consent'] as const

export type ClientWrite = TablesUpdate<'clients'>

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
  return s ? s : null
}

function oneOf(field: string, v: unknown, allowed: readonly string[]): { value: string | null } | { error: string } {
  const s = text(v)
  if (s === null) return { value: null }
  if (!allowed.includes(s)) return { error: `${field.replace(/_/g, ' ')} "${s}" is not one of ${allowed.join(', ')}` }
  return { value: s }
}

/**
 * The fields a body sets, checked. `create` needs a first name; nothing else
 * is required — a lead from a phone call may have no surname or email yet.
 * A blank cell is stored as nothing (null), never ''.
 */
export function parseClientWrite(body: unknown, mode: 'create' | 'update'): { data: ClientWrite } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Nothing to save' }
  const b = body as Record<string, unknown>
  // Filled field by field from the checked lists below.
  const data: Record<string, string | string[] | number | boolean | null> = {}

  for (const k of TEXT) if (b[k] !== undefined) data[k] = text(b[k])
  if (mode === 'create' || b.first_name !== undefined) {
    if (!data.first_name) return { error: 'First name is required' }
  }
  if (typeof data.email === 'string') {
    data.email = data.email.toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { error: `"${data.email}" is not an email address` }
  }

  for (const k of LISTS) {
    if (b[k] === undefined) continue
    if (b[k] === null) { data[k] = []; continue }
    if (!Array.isArray(b[k])) return { error: `${k.replace(/_/g, ' ')} is a list` }
    data[k] = [...new Set((b[k] as unknown[]).map(text).filter((s): s is string => !!s))]
  }
  for (const k of FLAGS) {
    if (b[k] === undefined) continue
    if (typeof b[k] !== 'boolean') return { error: `${k.replace(/_/g, ' ')} is true or false` }
    data[k] = b[k] as boolean
  }

  if (b.date_of_birth !== undefined) {
    const d = text(b.date_of_birth)
    if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) return { error: `Date of birth "${d}" is not a date (YYYY-MM-DD)` }
    data.date_of_birth = d
  }
  if (b.agent_commission_rate !== undefined) {
    if (b.agent_commission_rate === null || b.agent_commission_rate === '') data.agent_commission_rate = null
    else {
      const n = Number(b.agent_commission_rate)
      if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'Agent commission is a percentage from 0 to 100' }
      data.agent_commission_rate = n
    }
  }

  const enums: Array<[string, readonly string[]]> = [
    ['client_type', CLIENT_TYPES],
    ['passport_type', PASSPORT_TYPES],
    ['lead_source', LEAD_SOURCES.map(s => s.value)],
    ['client_source', CLIENT_SOURCES],
    ['currency_preference', SUPPORTED_CURRENCIES],
  ]
  for (const [k, allowed] of enums) {
    if (b[k] === undefined) continue
    const r = oneOf(k, k === 'currency_preference' ? text(b[k])?.toUpperCase() : b[k], allowed)
    if ('error' in r) return r
    data[k] = r.value
  }
  if (b.status !== undefined) {
    const s = text(b.status)
    if (s && !CLIENT_STAGES.some(st => st.key === s) && normalizeClientStage(s) === 'lead' && s !== 'prospect') {
      return { error: `Stage "${s}" is not one of ${CLIENT_STAGES.map(st => st.key).join(', ')}` }
    }
    data.status = normalizeClientStage(s ?? 'lead')
  }
  if (data.client_type === null) delete data.client_type // the column's default, never blank

  return { data: data as ClientWrite }
}

/** full_name as the database keeps it: first and last, trimmed. */
export function clientFullName(first: string | null | undefined, last: string | null | undefined): string {
  return `${first ?? ''} ${last ?? ''}`.trim()
}

/** Escape a search for a PostgREST or() filter: a comma or bracket in the
 *  text ended the filter early or broke it, and % and _ are LIKE wildcards. */
export function orSearchTerm(raw: string): string {
  return raw.trim().replace(/[\\%_]/g, m => `\\${m}`).replace(/[,()"]/g, ' ').replace(/\s+/g, ' ').trim()
}
