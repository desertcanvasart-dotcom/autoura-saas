import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// Confirming an itinerary creates its booking (quote_id/quote_type NULL).
// Live 2026-09-24 (ITN-S-2026-6386 → BK-2026-0003) that booking crashed the
// bookings list and page, was invisible from the itinerary, and its draft
// quote could still be converted into a second booking.
// ============================================================================

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')
const code = (src: string) =>
  src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

describe('a booking with no quote renders', () => {
  for (const f of ['app/bookings/page.tsx', 'app/bookings/[id]/page.tsx']) {
    it(`${f} never calls a string method on a bare quote_type`, () => {
      // Every string call on quote_type must sit behind a `quote_type ?` guard.
      const src = code(read(f))
      const calls = src.match(/booking\.quote_type\.\w+\(/g) ?? []
      const guarded = src.match(/booking\.quote_type \? booking\.quote_type\.\w+\(/g) ?? []
      expect(calls.length).toBe(guarded.length)
    })
  }
})

describe('the itinerary shows its booking', () => {
  for (const f of ['app/itineraries/[id]/page.tsx', 'app/itineraries/[id]/edit/page.tsx']) {
    it(`${f} renders the booking action (Go to / Create / Convert to Booking)`, () => {
      expect(read(f)).toContain('<ItineraryBookingAction')
    })
  }
})

describe('one sale, one booking', () => {
  it('converting a quote first checks the ITINERARY for a booking, before inserting', () => {
    const src = read('app/api/bookings/from-quote/route.ts')
    const guard = src.indexOf(".eq('itinerary_id', itinerary_id)")
    const insert = src.indexOf(".from('bookings')\n        .insert(")
    expect(guard).toBeGreaterThan(-1)
    expect(src.slice(guard, guard + 800)).toMatch(/quote_type == null \|\| b\.quote_type === quote_type/)
    if (insert > -1) expect(guard).toBeLessThan(insert)
  })
})

describe('the itinerary editor never zeroes a priced trip', () => {
  it('saveDraft writes total_cost only when services are loaded, as the client total', () => {
    const src = read('app/itineraries/[id]/edit/page.tsx')
    const body = src.slice(src.indexOf('const saveDraft = async'), src.indexOf('// 2. Update each day'))
    expect(body).toContain('itineraryClientTotal(liveServices, itinerary.margin_percent)')
    expect(body).toContain('...(liveServices.length > 0 ? { total_cost: clientTotal } : {})')
  })
})

describe('resource assignment tabs', () => {
  // Live 2026-09-24: Drivers is 'teal' and COLOR_CLASSES had no teal — the
  // tab crashed the page the moment it became active.
  it('every tab colour has an entry in COLOR_CLASSES', () => {
    const src = read('app/components/ResourceAssignmentV2.tsx')
    const table = src.slice(src.indexOf('const COLOR_CLASSES'), src.indexOf('export default function'))
    const used = new Set([...src.matchAll(/^\s+color: '(\w+)'/gm)].map(m => m[1]))
    expect(used.size).toBeGreaterThan(5)
    for (const c of used) expect(table, `missing colour ${c}`).toMatch(new RegExp(`\\n\\s+${c}: \\{`))
  })
})

describe('Create Booking for a confirmed itinerary', () => {
  it('books only a confirmed itinerary, through the one booking-on-confirm step', () => {
    const src = code(read('app/api/itineraries/[id]/booking/route.ts'))
    expect(src).toContain("itinerary.status !== 'confirmed'")
    expect(src).toContain('createBookingOnConfirm(id,')
    // Confirm itself uses the same function — one implementation.
    expect(read('app/api/itineraries/[id]/route.ts')).toContain("from '@/lib/bookings/create-booking-on-confirm'")
  })
})
