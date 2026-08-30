// ============================================
// Package-gated service defaults (ported from travel-ops-pro)
// ============================================
// Two latent bugs: a SINGLE-day template with no explicit services defaulted
// airport arrival AND departure AND hotel check-in AND check-out onto its one
// day — a day tour priced like a whole package — and no product ever escaped
// the full-package assumption. Explicit day.services win over everything,
// mirroring the pricing grid's package-mask precedence.
import { vi, describe, it, expect } from 'vitest'

vi.mock('@supabase/supabase-js', async () => {
  const mock = await import('./_mock-supabase')
  return { createClient: () => mock.createMockClient() }
})

import { parseItinerary } from '@/lib/auto-pricing-service'
import { packageRules } from '@/lib/ai/package-prompt-rules'
import { PACKAGE_TYPE_CONFIGS } from '@/lib/package-types'

const bareDay = (title: string) => ({ title, description: '' })

describe('parseItinerary — package-gated service defaults', () => {
  it('single-day, no package (historical full-package): airport yes, hotel NO', () => {
    // One day = no overnight = nothing to check into, whatever the package.
    const [d] = parseItinerary([bareDay('Cairo Day Tour')])
    expect(d.services.airport_arrival).toBe(true)
    expect(d.services.airport_departure).toBe(true)
    expect(d.services.hotel_checkin).toBe(false)
    expect(d.services.hotel_checkout).toBe(false)
  })

  it('single-day tours-only: no airport, no hotel — just the tour', () => {
    const [d] = parseItinerary([bareDay('Luxor Day Tour')], { packageType: 'tours-only' })
    expect(d.services.airport_arrival).toBe(false)
    expect(d.services.hotel_checkin).toBe(false)
  })

  it('multi-day full-package keeps the historical defaults', () => {
    const days = parseItinerary([bareDay('Arrival'), bareDay('Giza'), bareDay('Departure')])
    expect(days[0].services.airport_arrival).toBe(true)
    expect(days[0].services.hotel_checkin).toBe(true)
    expect(days[2].services.airport_departure).toBe(true)
  })

  it('multi-day land-package: hotels defaulted, airport transfers not', () => {
    const days = parseItinerary([bareDay('Arrival'), bareDay('Departure')], { packageType: 'land-package' })
    expect(days[0].services.hotel_checkin).toBe(true)
    expect(days[0].services.airport_arrival).toBe(false)
  })

  it('explicit day.services beat the package gate', () => {
    const days = parseItinerary(
      [{ ...bareDay('Special'), services: { airport_arrival: true, airport_departure: false, hotel_checkin: false, hotel_checkout: false, guide_required: false } }],
      { packageType: 'tours-only' }
    )
    expect(days[0].services.airport_arrival).toBe(true)
  })
})

describe('packageRules — what the AI is told to exclude', () => {
  const rules = (slug: string) => packageRules(PACKAGE_TYPE_CONFIGS.find(c => c.slug === slug)!)

  it('tours-only excludes accommodation, hotel services and airport transfers', () => {
    const r = rules('tours-only')
    expect(r).toContain('NO accommodation')
    expect(r).toContain('NO hotel_services')
    expect(r).toContain('NO airport transfers')
  })

  it('land-package excludes airport transfers but keeps hotels', () => {
    const r = rules('land-package')
    expect(r).toContain('NO airport transfers')
    expect(r).not.toContain('NO accommodation')
  })

  it('full-package changes nothing — the day templates apply as written', () => {
    expect(rules('full-package')).toContain('apply as written')
  })
})
