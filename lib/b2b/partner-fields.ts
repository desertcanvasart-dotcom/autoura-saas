// ============================================
// What a partner write may set, and how it is checked
// ============================================
// The partner routes inserted and updated the request body as sent, so any
// column — created_by, status, tenant-adjacent flags — could be written. This
// is the list a partner's form edits, checked. Lives here so it can be tested.

import { SUPPORTED_CURRENCIES } from '@/lib/currency'

export type PartnerWrite = Partial<{
  company_name: string
  partner_code: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  default_margin_percent: number | null
  currency: string | null
  payment_terms: string | null
  credit_limit: number | null
  notes: string | null
  is_active: boolean
}>

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

export function parsePartnerWrite(body: unknown, mode: 'create' | 'update'): { data: PartnerWrite } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Nothing to save' }
  const b = body as Record<string, unknown>
  const data: PartnerWrite = {}

  if (b.company_name !== undefined || mode === 'create') {
    const name = text(b.company_name)
    if (!name) return { error: 'Company name is required' }
    data.company_name = name
  }
  if (b.partner_code !== undefined) {
    const code = text(b.partner_code)
    if (code) data.partner_code = code
  }
  for (const k of ['contact_name', 'email', 'phone', 'address', 'city', 'country', 'payment_terms', 'notes'] as const) {
    if (b[k] !== undefined) data[k] = text(b[k])
  }
  if (b.default_margin_percent !== undefined) {
    if (b.default_margin_percent === null || b.default_margin_percent === '') data.default_margin_percent = null
    else {
      const n = Number(b.default_margin_percent)
      if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'Default margin is a percentage from 0 to 100' }
      data.default_margin_percent = n
    }
  }
  if (b.credit_limit !== undefined) {
    if (b.credit_limit === null || b.credit_limit === '') data.credit_limit = null
    else {
      const n = Number(b.credit_limit)
      if (!Number.isFinite(n) || n < 0) return { error: 'Credit limit is an amount of 0 or more' }
      data.credit_limit = n
    }
  }
  if (b.currency !== undefined) {
    const c = text(b.currency)?.toUpperCase() ?? null
    if (c && !(SUPPORTED_CURRENCIES as readonly string[]).includes(c)) return { error: `Currency "${c}" is not supported` }
    data.currency = c
  }
  if (b.is_active !== undefined) {
    if (typeof b.is_active !== 'boolean') return { error: 'Active is true or false' }
    data.is_active = b.is_active
  }
  return { data }
}

/** A partner code no other partner of the agency has: the company's first
 *  three letters and the next free number (it was a random 000–999, so two
 *  "Nile …" partners could share NIL-042). */
export function nextPartnerCode(companyName: string, taken: Iterable<string | null | undefined>): string {
  const prefix = (companyName.replace(/[^A-Za-z0-9]/g, '').slice(0, 3) || 'PTN').toUpperCase()
  const used = new Set<string>()
  for (const c of taken) if (c) used.add(c.toUpperCase())
  for (let n = 1; ; n++) {
    const code = `${prefix}-${String(n).padStart(3, '0')}`
    if (!used.has(code)) return code
  }
}
