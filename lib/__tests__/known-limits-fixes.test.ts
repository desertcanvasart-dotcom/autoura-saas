import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { priceB2cQuote, withSeasonPremium } from '../quotes/b2c-quote-price'
import { quotePriceFields } from '../pricing/grid-quote-sync'
import { dayLoads, capacityProblems, describeCapacityProblems } from '../capacity/booking-capacity'
import { costModeOf } from '../itineraries/default-cost-mode'
import { reminderChannels } from '../tasks/task-reminders'

// ============================================================================
// The three limits fixed before go-live: seasonal premiums on every quote,
// the Capacity Calendar enforced, and the preferences that did nothing.
// ============================================================================

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('seasonal premium on B2C quotes', () => {
  it('is a percentage of the price after margin, its own line, inside the selling price', () => {
    const p = priceB2cQuote({ totalCost: 1000, marginPercent: 25, travelers: 2, currency: 'EUR', seasonPercent: 10 })
    expect(p).toEqual({ selling_price: 1375, price_per_person: 687.5, season_premium: 125 })
  })

  it('an ordinary date adds nothing', () => {
    expect(priceB2cQuote({ totalCost: 1000, marginPercent: 25, travelers: 2, currency: 'EUR' }).season_premium).toBe(0)
  })

  it('rounds in the currency (whole yen)', () => {
    expect(withSeasonPremium(10001, 15, 3, 'JPY')).toEqual({ selling_price: 11501, price_per_person: 3834, season_premium: 1500 })
  })

  it('the Quote Builder save records it on the quote', () => {
    const f = quotePriceFields({ pax: 2, tier: 'standard', currency: 'EUR', supplierTotal: 800, sellingTotal: 1000, marginPercent: 25, season: { season_name: 'New Year', season_percent: 20 } })
    expect(f).toMatchObject({ selling_price: 1200, price_per_person: 600, season_name: 'New Year', season_percent: 20, season_premium: 200 })
  })

  it('every B2C pricing route asks the calendar', () => {
    for (const f of ['app/api/quotes/b2c/from-itinerary/route.ts', 'app/api/quotes/b2c/[id]/route.ts', 'app/api/pricing-grid/save/route.ts']) {
      expect(src(f), f).toMatch(/quoteSeasonFor\(/)
    }
  })
})

describe('the Capacity Calendar', () => {
  const rows = [
    { date: '2026-12-31', status: 'available', max_groups: 2, booked_groups: 1 },
    { date: '2027-01-02', status: 'blackout', max_groups: 3, booked_groups: 0, reason: 'Office closed' },
  ]
  const bookings = [{ start_date: '2026-12-30', end_date: '2027-01-01' }]

  it('counts live bookings on every day they run, plus groups booked outside', () => {
    const loads = dayLoads('2026-12-30', '2027-01-02', rows, bookings, null)
    expect(loads.map(l => [l.date, l.booked, l.max])).toEqual([
      ['2026-12-30', 1, null], ['2026-12-31', 2, 2], ['2027-01-01', 1, null], ['2027-01-02', 0, 3],
    ])
  })

  it('a full day and a closed day refuse a new group; no limit takes any', () => {
    const problems = capacityProblems(dayLoads('2026-12-30', '2027-01-02', rows, bookings, null))
    expect(problems.map(p => [p.date, p.why])).toEqual([['2026-12-31', 'full'], ['2027-01-02', 'closed']])
    expect(describeCapacityProblems(problems)).toBe('full on 31 Dec (2 of 2 groups); closed on 2 Jan (Office closed)')
  })

  it('the company default applies to a day without its own entry', () => {
    const problems = capacityProblems(dayLoads('2026-12-30', '2026-12-30', [], bookings, 1))
    expect(problems.map(p => p.why)).toEqual(['full'])
  })

  it('bookings are checked where they are made, with a manager override', () => {
    const fq = src('app/api/bookings/from-quote/route.ts')
    expect(fq).toMatch(/bookingCapacityProblems\(/)
    expect(fq).toMatch(/override_capacity === true && roleAllows\(authResult\.role, 'manage'\)/)
    expect(src('lib/bookings/create-booking-on-confirm.ts')).toMatch(/bookingCapacityProblems\(/)
    expect(src('app/api/capacity/check/route.ts')).toMatch(/loadDayLoads\(/)
  })

  it('the default is saved, admin-only', () => {
    const r = src('app/api/capacity/default/route.ts')
    expect(r).toMatch(/roleDenied\(auth\.role, 'admin'\)/)
    expect(r).toMatch(/default_max_groups_per_day/)
  })
})

describe('preferences that did nothing', () => {
  it('cost mode: only "manual" is manual', () => {
    expect(costModeOf('manual')).toBe('manual')
    expect(costModeOf('auto')).toBe('auto')
    expect(costModeOf(undefined)).toBe('auto')
    expect(src('app/api/itineraries/route.ts')).toMatch(/cost_mode: await defaultCostMode\(/)
    expect(src('app/api/pricing-grid/save/route.ts')).toMatch(/cost_mode: await defaultCostMode\(/)
  })

  it('Task Assigned / Task Completed switches are read', () => {
    expect(reminderChannels({ task_assigned: false }, 'task_assigned').remind).toBe(false)
    expect(reminderChannels({ task_completed: true, email_enabled: false }, 'task_completed')).toEqual({ remind: true, email: false, inApp: true })
    expect(src('lib/notifications.ts')).toMatch(/taskChannelsFor\(/)
  })

  it('completing a task tells its creator', () => {
    expect(src('app/api/tasks/route.ts')).toMatch(/created_by: authResult\.user\?\.id/)
    expect(src('app/api/tasks/[id]/route.ts')).toMatch(/notifyTaskCompleted\(/)
  })
})
