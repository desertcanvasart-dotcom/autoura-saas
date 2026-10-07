import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { DAY_COPY_COLUMNS, ITINERARY_COPY_COLUMNS, SERVICE_COPY_COLUMNS, copyCode, copyDay, copyItinerary, copyService } from '@/lib/itineraries/duplicate'

describe('the copy of an itinerary', () => {
  const original = {
    id: 'it-1', itinerary_code: 'ITN-S-2026-8987', tenant_id: 't', user_id: 'u',
    trip_name: 'Cairo & Alexandria Classic', client_name: 'Tersa', start_date: '2026-10-01', end_date: '2026-10-04',
    num_adults: 2, total_cost: 2349.5, margin_percent: 25, currency: 'EUR', tier: 'standard', notes: 'Created via Pricing Grid',
    status: 'confirmed', cancelled_at: null, cancellation_reason: null, payment_status: 'paid', total_paid: 2415.72,
    deposit_amount: 700, balance_due: 0, pdf_url: 'x.pdf', fx_frozen: { EUR: 1 }, idempotency_key: 'k', thread_id: 'th',
    source_conversation: 'c', generation_warnings: ['w'], assigned_guide_id: 'g', assigned_vehicle_id: 'v', assigned_to: 'adham',
    created_at: 'then', updated_at: 'then',
  }

  it('keeps the trip, the client and the prices; a new draft with a new code and "(copy)"', () => {
    expect(copyItinerary(original, 'ITN-S-2026-1234')).toEqual({
      itinerary_code: 'ITN-S-2026-1234', status: 'draft', trip_name: 'Cairo & Alexandria Classic (copy)',
      client_name: 'Tersa', start_date: '2026-10-01', end_date: '2026-10-04', num_adults: 2, total_cost: 2349.5,
      margin_percent: 25, currency: 'EUR', tier: 'standard', notes: 'Created via Pricing Grid', assigned_to: 'adham',
    })
  })

  it('a code in the original\'s style, this year', () => {
    expect(copyCode('ITN-S-2026-8987', 2027, 4321)).toBe('ITN-S-2027-4321')
    expect(copyCode('ITN-2025-12', 2026, 1000)).toBe('ITN-2026-1000')
    expect(copyCode('CON-ABC123', 2026, 1000)).toBe('ITN-2026-1000')
  })
})

describe('its days and services', () => {
  it('a day moves to the copy, with all it says', () => {
    expect(copyDay({ id: 'd1', itinerary_id: 'it-1', tenant_id: 't', day_number: 1, city: 'Cairo', created_at: 'x' }, 'it-2'))
      .toEqual({ itinerary_id: 'it-2', day_number: 1, city: 'Cairo' })
  })

  it('a service points at the copy\'s day; commission starts over; a line on a missing day is left out', () => {
    const days = new Map([['d1', 'n1']])
    expect(copyService({ id: 's1', itinerary_id: 'it-1', itinerary_day_id: 'd1', day_id: 'd1', service_name: 'Guide', total_cost: 80, commission_status: 'paid' }, 'it-2', days))
      .toEqual({ itinerary_id: 'it-2', itinerary_day_id: 'n1', day_id: 'n1', service_name: 'Guide', total_cost: 80 })
    expect(copyService({ id: 's2', itinerary_id: 'it-1', itinerary_day_id: 'gone', service_name: 'X' }, 'it-2', days)).toBeNull()
  })
})

describe('the copied columns exist', () => {
  // A listed column the table does not have would fail the select at run time.
  const types = readFileSync(join(process.cwd(), 'types/database.types.ts'), 'utf8')
  const rowColumns = (table: string) => {
    const start = types.indexOf(`      ${table}: {\n        Row: {`)
    expect(start, table).toBeGreaterThan(-1)
    const body = types.slice(start, types.indexOf('        Insert: {', start))
    return new Set([...body.matchAll(/^          ([a-z_]+)\??:/gm)].map(m => m[1]))
  }
  it.each([
    ['itineraries', ITINERARY_COPY_COLUMNS],
    ['itinerary_days', DAY_COPY_COLUMNS],
    ['itinerary_services', SERVICE_COPY_COLUMNS],
  ] as const)('%s', (table, columns) => {
    const have = rowColumns(table)
    expect(columns.filter(c => !have.has(c))).toEqual([])
  })
})
