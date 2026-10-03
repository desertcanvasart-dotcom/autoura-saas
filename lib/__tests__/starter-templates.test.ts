/* eslint-disable @typescript-eslint/no-explicit-any -- a hand-rolled query-builder fake */
import { describe, it, expect, vi } from 'vitest'
import { STARTER_CUSTOMER_TEMPLATES } from '@/lib/templates/starter-customer-templates'
import { STARTER_SUPPLIER_TEMPLATES } from '@/lib/templates/starter-supplier-templates'
import { STARTER_PARTNER_TEMPLATES } from '@/lib/templates/starter-partner-templates'

const ALL = [...STARTER_CUSTOMER_TEMPLATES, ...STARTER_SUPPLIER_TEMPLATES, ...STARTER_PARTNER_TEMPLATES]
import { getPlaceholders, PLACEHOLDER_REFERENCE } from '@/lib/template-placeholders'

describe('starter customer templates', () => {
  it('cover every customer step in the app, each with an email or WhatsApp version', () => {
    const steps = new Set(STARTER_CUSTOMER_TEMPLATES.map(t => t.subcategory))
    for (const s of ['lead_response', 'quotation', 'deposit_request', 'booking_confirmation', 'day_before', 'check_in', 'post_trip']) {
      expect(steps.has(s)).toBe(true)
    }
    for (const t of STARTER_CUSTOMER_TEMPLATES) {
      expect(t.category).toBe('customer')
      if (t.channel === 'email') expect(t.subject).toBeTruthy()
      else expect(t.subject).toBeNull()
    }
    const names = ALL.map(t => t.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('use only placeholders the reference documents, and name no company', () => {
    const known = new Set(PLACEHOLDER_REFERENCE.map(p => p.key))
    for (const t of ALL) {
      for (const key of getPlaceholders(`${t.subject ?? ''}\n${t.body}`)) expect(known, `${t.name}: {{${key}}}`).toContain(key)
      const text = `${t.subject} ${t.body}`
      expect(text).not.toMatch(/travel2egypt|autoura|\$\d/i)
      // No currency symbol for the euro (char code 8364): amounts come from {{total}} etc.
      expect([...text].some(c => c.charCodeAt(0) === 8364)).toBe(false)
    }
  })
})

// The route, with requireAuth and the database faked.
const inserted: Array<Record<string, unknown>[]> = []
let existingNames: string[] = []
vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({
    error: null,
    tenant_id: 't1',
    supabase: {
      from: () => {
        const q: any = {
          select: () => q,
          eq: () => q,
          then: (resolve: (v: unknown) => void) => resolve({ data: existingNames.map(name => ({ name })), error: null }),
          insert: async (rows: Record<string, unknown>[]) => { inserted.push(rows); return { error: null } },
        }
        return q
      },
    },
  }),
}))

describe('starter supplier templates', () => {
  it('cover hotels, cruises, transport and guides on the subcategories the send window maps to a supplier type', () => {
    const steps = new Set(STARTER_SUPPLIER_TEMPLATES.map(t => t.subcategory))
    for (const s of ['rate_request', 'booking_request', 'hotel_voucher', 'cruise_hold', 'cruise_voucher', 'transport_booking', 'transport_voucher', 'guide_booking', 'guide_voucher']) {
      expect(steps.has(s)).toBe(true)
    }
    for (const t of STARTER_SUPPLIER_TEMPLATES) {
      expect(t.category).toBe('supplier')
      expect(t.body).toContain('{{supplier_name}}')
      if (t.channel === 'email') expect(t.subject).toBeTruthy()
      else expect(t.subject).toBeNull()
    }
  })
})

describe('starter partner templates', () => {
  it('cover every B2B partner step, filed under the category the send window treats as a partner', () => {
    const steps = new Set(STARTER_PARTNER_TEMPLATES.map(t => t.subcategory))
    for (const s of ['partnership', 'rate_sheet', 'partner_quote', 'commission_statement']) expect(steps.has(s)).toBe(true)
    for (const t of STARTER_PARTNER_TEMPLATES) {
      expect(t.category).toBe('partner')
      expect(t.body).toContain('{{partner_name}}')
      if (t.channel === 'email') expect(t.subject).toBeTruthy()
      else expect(t.subject).toBeNull()
    }
  })
})

describe('POST /api/templates/starter', () => {
  it('adds all starters to the caller company, then skips the ones it already has', async () => {
    const { POST } = await import('@/app/api/templates/starter/route')
    existingNames = []
    const first = await (await POST()).json()
    expect(first).toMatchObject({ success: true, created: ALL.length, skipped: 0 })
    expect(inserted[0].every(r => r.tenant_id === 't1' && r.is_active === true)).toBe(true)
    expect(inserted[0][0].placeholders).toContain('{{client_first_name}}')

    existingNames = ['Booking confirmed', 'deposit request']
    const second = await (await POST()).json()
    expect(second).toMatchObject({ success: true, created: ALL.length - 2, skipped: 2 })
    expect(inserted[1].map(r => r.name)).not.toContain('Booking confirmed')
  })
})
