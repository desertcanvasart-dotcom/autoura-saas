// An activity added to a day (the motorboat at Philae) is charged from the
// activity catalogue on a land day, and skipped on a cruise day — where it
// rides in the cruise sightseeing package (operator, 2026-09-22).
import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setMockTablesStamped as setMockTables } from './_mock-supabase'
import { TEMPLATE_ID, cairoTemplateRow, fullRateTables } from './fixtures/sample-templates'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { calculateDayBasedPricing } from '@/lib/auto-pricing-service'

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
})
beforeEach(() => setMockTables({}))

const MOTORBOAT = {
  id: 'act-boat', tenant_id: 'test-tenant', activity_name: 'Philae Temple Boat Ride',
  city: 'Cairo', pricing_type: 'per_unit', base_rate_eur: 800, base_rate_non_eur: 800,
  max_capacity: 10, unit_label: 'boat', tiers: null, rate_currency: 'EUR', is_active: true,
}

/** Price the Cairo trip with `activityIds` on day 3, whose night is `night`. */
async function price(activityIds: string[], night = 'none', activityRows = [MOTORBOAT]) {
  const tables = fullRateTables()
  tables.activity_rates = activityRows
  const template = JSON.parse(JSON.stringify(cairoTemplateRow))
  const day3 = template.itinerary.find((d: { day: number }) => d.day === 3)
  day3.activity_ids = activityIds
  day3.accommodation_type = night
  tables.tour_templates = [template]
  setMockTables(tables)
  return calculateDayBasedPricing({
    templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
    isEurPassport: true, language: 'English', marginPercent: 25, requestedPax: 4,
  })
}

describe('an activity on a day', () => {
  it('is charged from the catalogue on a land day — one boat for a group within capacity', async () => {
    const result = await price(['act-boat'], 'none')
    const line = result.services.find(s => s.serviceType === 'activity' && s.lineTotal > 0)
    expect(line?.serviceName).toBe('Philae Temple Boat Ride')
    expect(line?.lineTotal).toBe(800) // per_unit, 4 pax, holds 10 → 1 boat
    expect(line?.isPerPax).toBe(false)
    expect(result.holes.some(h => h.kind === 'activity')).toBe(false)
  })

  it('is NOT charged on a cruise day — it rides in the cruise package (a 0 line)', async () => {
    const result = await price(['act-boat'], 'cruise')
    const charged = result.services.find(s => s.serviceType === 'activity' && s.lineTotal > 0)
    expect(charged).toBeUndefined()
    const included = result.services.find(s => s.serviceType === 'activity')
    expect(included?.lineTotal).toBe(0)
  })

  it('adds a second boat when the group exceeds one boat', async () => {
    const tables = fullRateTables()
    tables.activity_rates = [MOTORBOAT]
    const template = JSON.parse(JSON.stringify(cairoTemplateRow))
    const day3 = template.itinerary.find((d: { day: number }) => d.day === 3)
    day3.activity_ids = ['act-boat']; day3.accommodation_type = 'none'
    tables.tour_templates = [template]
    setMockTables(tables)
    const result = await calculateDayBasedPricing({
      templateId: TEMPLATE_ID, tenantId: 'test-tenant', tier: 'standard',
      isEurPassport: true, marginPercent: 25, requestedPax: 14,
    })
    const line = result.services.find(s => s.serviceType === 'activity' && s.lineTotal > 0)
    expect(line?.lineTotal).toBe(1600) // ceil(14/10) = 2 boats
  })

  it('a picked activity that is gone (or has no rate) is a hole, not a free line', async () => {
    const result = await price(['no-such-activity'], 'none')
    expect(result.holes.some(h => h.kind === 'activity')).toBe(true)
    expect(result.complete).toBe(false)
  })
})
