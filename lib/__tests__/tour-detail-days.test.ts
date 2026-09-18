import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { templateDaysToDetail } from '@/lib/tours/tour-detail-days'

// ============================================
// A tour opens, and shows the programme somebody wrote
// ============================================
// Reported 2026-09-18: opening any tour from Tour Inventory gave "Tour Not
// Found". The detail route only knew how to load a tour_variation, and the
// live database held ONE variation row against 44 templates — so 43 of 44
// tours dead-ended, in every tenant. The same route read its days from
// `variation_daily_itinerary`, which held zero rows, while 41 of 44 templates
// carry their days in tour_templates.itinerary.

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

describe('templateDaysToDetail', () => {
  it('maps a day the operator wrote', () => {
    const [day] = templateDaysToDetail([
      {
        day: 1,
        title: 'Abu Simbel Temples & Overnight',
        description: 'Pickup from your hotel in Aswan…',
        city: 'Abu Simbel',
        accommodation_type: 'hotel',
        meals: { breakfast: 'included', lunch: 'external', dinner: 'none' },
      },
    ])
    expect(day.day_number).toBe(1)
    expect(day.day_title).toBe('Abu Simbel Temples & Overnight')
    expect(day.city).toBe('Abu Simbel')
    expect(day.overnight_city).toBe('Abu Simbel')
  })

  it('counts a restaurant meal as given — it is on the bill', () => {
    const [day] = templateDaysToDetail([
      { day: 1, title: 'x', meals: { breakfast: 'included', lunch: 'external', dinner: 'none' } },
    ])
    expect(day.breakfast_included).toBe(true)
    expect(day.lunch_included).toBe(true)
    expect(day.dinner_included).toBe(false)
  })

  it('does not put the customer up on a day that has no night', () => {
    const [day] = templateDaysToDetail([
      { day: 2, title: 'Return to Aswan', city: 'Aswan', accommodation_type: 'none' },
    ])
    expect(day.city).toBe('Aswan')
    expect(day.overnight_city).toBe('')
  })

  it('reads the legacy array shape of meals too', () => {
    const [day] = templateDaysToDetail([{ day: 1, title: 'x', meals: ['Breakfast'] }])
    expect(day.breakfast_included).toBe(true)
    expect(day.dinner_included).toBe(false)
  })

  it('runs in day order and survives rubbish', () => {
    const days = templateDaysToDetail([
      { day: 3, title: 'c' },
      null,
      'not a day',
      { day: 1, title: 'a' },
    ])
    expect(days.map(d => d.day_title)).toEqual(['a', 'c'])
  })

  it('says nothing when there is nothing', () => {
    expect(templateDaysToDetail(null)).toEqual([])
    expect(templateDaysToDetail([])).toEqual([])
  })
})

describe('the tour detail route', () => {
  const SOURCE = read('app/api/tours/[code]/route.ts')

  it('does not need a variation to find the tour', () => {
    // A variation is a pricing shape. Requiring one to OPEN a tour is what
    // turned every inventory into a wall of "Tour not found".
    expect(SOURCE).toMatch(/from\('tour_templates'\)[\s\S]{0,400}?\.eq\(isUuid \? 'id' : 'template_code', code\)/)
    expect(SOURCE).toMatch(/if \(!template\) \{[\s\S]{0,200}?'Tour not found'/)
  })

  it('answers with the template, and the variation only when there is one', () => {
    expect(SOURCE).toContain('variation_id: variation?.id ?? null')
    expect(SOURCE).toContain('template_name: template.template_name')
  })

  it('falls back to the days the operator actually wrote', () => {
    expect(SOURCE).toContain('templateDaysToDetail(template.itinerary)')
  })
})

describe('the tour detail page', () => {
  const PAGE = read('app/tours/[code]/page.tsx')

  it('shows the tour without a price rather than not at all', () => {
    expect(PAGE).toMatch(/\{!tour\.variation_id \? \(/)
    expect(PAGE).toContain('No price yet')
  })

  it('reads a variation field only behind a guard', () => {
    // These are the three that threw or printed nonsense on a tour with no
    // variation: tier.charAt on null, "null-null pax", and a pax dropdown of
    // length null.
    expect(PAGE).toMatch(/\{tour\.tier && \(/)
    expect(PAGE).toMatch(/\{tour\.group_type && \(/)
    expect(PAGE).toContain('tour.min_pax != null && tour.max_pax != null')
    expect(PAGE).toContain('length: tour.max_pax ?? 20')
  })
})
