import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tripServices } from '@/lib/itineraries/trip-services'

vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { operating_country: 'Egypt' } }) }) }) }),
  }),
}))

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('tripServices', () => {
  it("reads a trip's services by its days (itinerary_id is not set by the AI or the editor)", async () => {
    const calls: Array<[string, string, unknown]> = []
    const db = {
      from: (table: string) => ({
        select: () => ({
          eq: async (c: string, v: string) => { calls.push([table, c, v]); return { data: [{ id: 'd1' }, { id: 'd2' }], error: null } },
          in: async (c: string, v: string[]) => { calls.push([table, c, v]); return { data: [{ total_cost: 100, client_price: 130 }], error: null } },
        }),
      }),
    }
    const r = await tripServices(db, 'it-1', 'total_cost, client_price')
    expect(r).toEqual({ ok: true, rows: [{ total_cost: 100, client_price: 130 }] })
    expect(calls).toEqual([['itinerary_days', 'itinerary_id', 'it-1'], ['itinerary_services', 'itinerary_day_id', ['d1', 'd2']]])
  })
  it('no route reads services by itinerary_id any more', () => {
    for (const f of ['app/api/itineraries/[id]/template-data/route.ts', 'app/api/clients/[id]/template-data/route.ts', 'app/api/whatsapp/send-contract/route.ts', 'app/share/[token]/page.tsx', 'app/api/itineraries/[id]/duplicate/route.ts']) {
      expect(src(f), f).not.toMatch(/from\('itinerary_services'\)[\s\S]{0,120}\.eq\('itinerary_id'/)
    }
  })
})

describe('server WhatsApp numbers', () => {
  it('a local number takes the tenant country code; 00 is the international prefix', async () => {
    const { internationalNumber } = await import('@/lib/whatsapp')
    expect(await internationalNumber('0100 123 4567', 'tenant-1')).toBe('+201001234567')
    expect(await internationalNumber('0044 20 7946 0958', 'tenant-1')).toBe('+442079460958')
    expect(await internationalNumber('+1 415 555 1234', 'tenant-1')).toBe('+14155551234')
    // No tenant: left as typed for the provider to judge.
    expect(await internationalNumber('0100 123 4567', null)).toBe('0100 123 4567')
  })
})

describe('invoice figures add up', () => {
  it('stores the subtotal before tax, and no tax line on a deposit/final share', () => {
    const route = src('app/api/invoices/route.ts')
    expect(route).not.toContain('subtotal: totalAmount,')
    expect(route).toContain('subtotal: roundToCurrency(total - tax + discount, currency)')
    expect(route).toContain("if (invoiceType !== 'standard') return { subtotal: total, tax_rate: 0, tax_amount: 0, discount_amount: 0 }")
  })
})
