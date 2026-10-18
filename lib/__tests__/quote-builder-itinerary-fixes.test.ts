import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { displayRate } from '@/app/pricing-grid/lib/display-rate'
import { optionItems, cruiseForTier } from '@/app/pricing-grid/lib/option-item'
import { quotePriceFields } from '@/lib/pricing/grid-quote-sync'
import { stashConversation, takeConversation, toUrlBase64 } from '@/lib/grid-handoff'
import type { RateOption } from '@/app/pricing-grid/types'

const ROOT = path.join(__dirname, '..', '..')
const src = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')
const rate = (base: string, target: string, r: number) => ({ base_currency: base, target_currency: target, rate: r, is_active: true }) as never

// Sell-group bugs, 2026-10-11.
describe('the Quote Builder’s display currency', () => {
  it('converts from the run currency, not an assumed EUR', () => {
    expect(displayRate('GBP', 'GBP', null)).toEqual({ ok: true, rate: null })
    expect(displayRate('GBP', 'USD', [rate('GBP', 'USD', 1.25)])).toEqual({ ok: true, rate: 1.25 })
    expect(displayRate('EUR', 'USD', null)).toEqual({ ok: false, reason: 'loading' })
  })
  it('a currency with no rate is refused, not shown with the wrong symbol', () => {
    const r = displayRate('EUR', 'JPY', [rate('EUR', 'USD', 1.1)])
    expect(r.ok).toBe(false)
    expect(src('app/pricing-grid/page.tsx')).toContain("fetch('/api/exchange-rates')")
    expect(src('app/pricing-grid/page.tsx')).not.toContain('data.data?.rates')
  })
})

describe('changing the tier', () => {
  const hotel = { id: 'h1', name: 'Nile Hotel', rateEur: 100, rateNonEur: 100, single_supp_eur: 40, single_supp_non_eur: 40 } as RateOption
  it('a swapped hotel keeps its single supplement', () => {
    const items = optionItems('accommodation', hotel)
    expect(items.map(i => i.rateId)).toEqual(['h1', 'h1_supp'])
    expect(src('app/pricing-grid/page.tsx')).toContain("optionItems('accommodation', newHotel)")
  })
  it('a swapped cruise keeps the ship when the tier has it', () => {
    const cruises = [
      { id: 'c1', name: 'MS Alpha - Luxury', city: 'Luxor', rateEur: 1, rateNonEur: 1 },
      { id: 'c2', name: 'MS Beta - Luxury', city: 'Aswan', rateEur: 1, rateNonEur: 1 },
    ] as RateOption[]
    expect(cruiseForTier({ name: 'MS Beta - Standard' }, 'Luxor', cruises)?.id).toBe('c2')
    expect(cruiseForTier({ name: 'MS Gamma' }, 'Aswan', cruises)?.id).toBe('c2')
    expect(cruiseForTier({ name: 'MS Gamma' }, 'Cairo', cruises)?.id).toBe('c1')
  })
})

describe('reopening, re-dating and parsing', () => {
  const page = src('app/pricing-grid/page.tsx')
  it('a loaded trip keeps its margin, passport, nationality and guide', () => {
    expect(page).toContain('marginPercent: Number(itn.margin_percent)')
    expect(page).toContain("passport: itn.is_euro_passport ? 'eu' as const : 'non_eu' as const")
    expect(page).toContain("guideMode: throughout ? 'throughout' : 'spot'")
  })
  it('a new start date reprices the picks', () => {
    expect(page).toContain("fetchRates(config.tier, config.startDate, dateChanged ? 'all' : undefined)")
  })
  it('the AI’s email and phone are kept', () => {
    expect(page).toContain('clientEmail: String(meta.clientEmail).trim()')
    expect(page).toContain('clientPhone: String(meta.clientPhone).trim()')
  })
})

describe('handing a conversation to the Quote Builder', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    ;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
      setItem: (k: string, v: string) => store.set(k, v),
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
    }
  })
  it('goes by sessionStorage, once', () => {
    const id = stashConversation('Client: 3 days in Cairo')!
    expect(takeConversation(id)).toBe('Client: 3 days in Cairo')
    expect(takeConversation(id)).toBeNull()
  })
  it('the fallback encodes a long thread without a RangeError', () => {
    expect(() => toUrlBase64('مرحبا '.repeat(50000))).not.toThrow()
    expect(src('app/whatsapp-inbox/page.tsx')).not.toContain('btoa(String.fromCharCode(...bytes))')
    expect(src('app/inbox/page.tsx')).toContain('stashConversation(conversationText)')
  })
})

describe('B2C quotes', () => {
  it('the grid rounds like the quote editor', () => {
    const f = quotePriceFields({ pax: 3, tier: 'standard', currency: 'JPY', supplierTotal: 1000, sellingTotal: 1000.4, marginPercent: 0 })
    expect(f.selling_price).toBe(1000)
    expect(f.price_per_person).toBe(333)
  })
  it('a quote with no price does not crash the page', () => {
    expect(src('app/quotes/b2c/[id]/page.tsx')).not.toContain('{quote.selling_price.toLocaleString()}')
    expect(src('app/quotes/b2c/page.tsx')).not.toContain('{quote.selling_price.toLocaleString()}')
  })
  it('the day bar knows every currency’s symbol', () => {
    expect(src('app/pricing-grid/components/DayRow.tsx')).toContain('const sym = getCurrencySymbol(config.currency)')
  })
})

describe('itineraries', () => {
  it('POST takes only a new trip’s fields', () => {
    const r = src('app/api/itineraries/route.ts')
    expect(r).toContain("const body: TablesInsert<'itineraries'> = {")
    expect(r).not.toContain('body.created_at = body.created_at || now')
    expect(r).toContain("status: 'draft',")
    expect(r).toContain("roleDenied(authResult.role, 'staff')")
  })
  it('the list shows the total the itinerary page shows, null-safe', () => {
    expect(src('app/api/itineraries/route.ts')).toContain('effective_total: effectiveItineraryTotal(itinerary, servicesBy.get(itinerary.id) ?? [])')
    expect(src('app/itineraries/page.tsx')).toContain('Number(itinerary.effective_total ?? itinerary.total_cost ?? 0)')
  })
  it('the share menu knows the link the trip already has', () => {
    expect(src('app/api/itineraries/[id]/share/route.ts')).toContain('export async function GET(')
    expect(src('app/itineraries/[id]/page.tsx')).toContain('.then(d => { if (d?.success) setShareUrl(d.url ?? null) })')
  })
  it('sending with no days says why; the messages point to where client details are edited', () => {
    const page = src('app/itineraries/[id]/page.tsx')
    expect(page).toContain('This trip has no days yet')
    expect(page).not.toContain('Please add it in edit mode')
  })
  it('the editor’s Invoice reports a refusal', () => {
    expect(src('app/itineraries/[id]/edit/page.tsx')).toContain("showToast('error', body.error || 'Failed to create invoice')")
  })
})
