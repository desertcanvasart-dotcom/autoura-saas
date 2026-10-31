import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// PostgREST stops a plain select at 1000 rows without an error. These lists
// read every page (lib/db/fetch-all-pages), and the reads that used to fail
// silently now fail out loud. Audit AW-5/6/7/10/12/14/15.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')
/** The body of the named exported handler, so a scan cannot pass on another one. */
function handler(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`)
  expect(start, `${name} handler`).toBeGreaterThanOrEqual(0)
  const next = src.indexOf('\nexport async function ', start + 1)
  return src.slice(start, next === -1 ? undefined : next)
}

const RATE_LISTS = [
  'activities', 'airport-services', 'attractions', 'cruises', 'entrance-fees', 'fixed-costs', 'flights',
  'guides', 'hotel-services', 'hotels', 'meals', 'sleeping-trains', 'tipping', 'trains', 'transportation',
]

describe('rate admin lists read every row (AW-7)', () => {
  for (const name of RATE_LISTS) {
    it(name, () => {
      const get = handler(read(`app/api/rates/${name}/route.ts`), 'GET')
      expect(get).toMatch(/fetchAllPages(<[^(]*>)?\(/)
      expect(get).toMatch(/\.order\('id'\)\.range\(from, |\.order\('id'\)\s*\n\s*\.range\(from, to\)/)
      expect(get).not.toMatch(/await query\b/)
    })
  }

  it('entrance-fees keeps an optional limit, NaN-safe', () => {
    const get = handler(read('app/api/rates/entrance-fees/route.ts'), 'GET')
    expect(get).not.toContain('parseInt(limit)')
    expect(get).toContain('Number.isFinite(askedLimit)')
  })
})

describe('bookings list reads every row (AW-10, short term)', () => {
  it('pages, ordered by booking date then id', () => {
    const get = handler(read('app/api/bookings/route.ts'), 'GET')
    expect(get).toMatch(/fetchAllPages(<[^(]*>)?\(/)
    expect(get).toContain(".order('booking_date', { ascending: false }).order('id').range(from, to)")
  })
})

describe('itinerary days (AW-12)', () => {
  const src = read('app/api/itineraries/[id]/days/route.ts')
  it('reads every day\'s services in one query, not one per day', () => {
    expect(src).toContain(".in('itinerary_day_id', dayIds)")
    expect(src).not.toContain(".eq('itinerary_day_id', day.id)")
    expect(src).toContain('if (servicesError) throw servicesError')
  })
  it('reads the whole hotel and ship catalogue, not the first 1000', () => {
    expect(src).toMatch(/fetchAllPages\(\(from, to\) =>\s*\n\s*supabase\.from\('accommodation_rates'\)/)
    expect(src).toMatch(/fetchAllPages\(\(from, to\) =>\s*\n\s*supabase\.from\('nile_cruises'\)/)
  })
})

describe('guides list (AW-6)', () => {
  const get = handler(read('app/api/guides/route.ts'), 'GET')
  it('a failed availability read fails the request — never "everyone is free"', () => {
    expect(get).toContain('if (bookingsError)')
    expect(get).toContain("'Could not check guide availability'")
  })
  it('statistics come from one query for every guide', () => {
    expect(get).toContain(".in('assigned_guide_id', guideIds)")
    expect(get).not.toContain(".eq('assigned_guide_id', guide.id)")
    expect(get).toContain('if (tripsError)')
  })
})

describe('notifications clear-all (AW-15)', () => {
  it('one scoped bulk delete, like mark-all-read', () => {
    const del = handler(read('app/api/notifications/clear-all/route.ts'), 'DELETE')
    expect(del).toContain('requireAuth()')
    expect(del).toContain('myNotificationsFilter(')
    expect(del).toMatch(/\.delete\(\)\s*\n\s*\.or\(mine\)/)
  })
  it('the bell uses it and clears its list only on success', () => {
    const bell = read('components/NotificationBell.tsx')
    const clear = bell.slice(bell.indexOf('const clearAllNotifications'), bell.indexOf('// Format relative time'))
    expect(clear).toContain("fetch('/api/notifications/clear-all', { method: 'DELETE' })")
    expect(clear).not.toContain('notifications.map(')
    expect(clear.indexOf('if (!response.ok)')).toBeLessThan(clear.indexOf('setNotifications([])'))
  })
})
