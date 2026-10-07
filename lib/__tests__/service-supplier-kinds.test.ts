import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  supplierBehaviorsForService, supplierCityForService, groupSuppliersByCity,
} from '@/lib/suppliers/service-supplier-kinds'
import { SUPPLIER_BEHAVIORS } from '@/lib/vocabulary'

// ============================================================================
// The itinerary editor offered every supplier for every line — its filter
// knew supplier types by old names ('transport'), so a car found no match
// and listed airlines, cruise lines and restaurants under "All Other
// Suppliers". A line now asks for its kind, in its city.
// ============================================================================

describe('supplierBehaviorsForService', () => {
  it.each([
    ['meal', ['restaurant']],
    ['accommodation', ['hotel']],
    ['transportation', ['transport_company', 'driver']],
    ['transfer', ['transport_company', 'driver', 'ground_handler']],
    ['guide', ['guide']],
    ['entrance_fee', ['attraction']],
    ['entrance', ['attraction']],
    ['activity', ['activity_provider']],
    ['cruise', ['cruise']],
    ['flight', ['airline']],
    ['tip', ['ground_handler', 'other']],
    [' Meal ', ['restaurant']],
  ])('%s → %j', (type, kinds) => {
    expect(supplierBehaviorsForService(type)).toEqual(kinds)
  })

  it('every service type the database allows has a kind (migration 132)', () => {
    for (const t of ['accommodation', 'transportation', 'guide', 'entrance', 'entrance_fee', 'meal', 'tip', 'tips', 'flight', 'transfer', 'cruise', 'activity', 'supplies', 'service_fee', 'hotel', 'other']) {
      expect(supplierBehaviorsForService(t).length, t).toBeGreaterThan(0)
    }
  })

  it('every kind is a real supplier behaviour — never an old name like "transport"', () => {
    const known = new Set<string>(SUPPLIER_BEHAVIORS.map(b => b.key))
    for (const t of ['accommodation', 'transportation', 'transfer', 'guide', 'meal', 'entrance', 'activity', 'cruise', 'flight', 'tip', 'train']) {
      for (const k of supplierBehaviorsForService(t)) expect(known.has(k), `${t} → ${k}`).toBe(true)
    }
  })

  it('an unknown type asks for no kind', () => {
    expect(supplierBehaviorsForService('spaceship')).toEqual([])
    expect(supplierBehaviorsForService(null)).toEqual([])
  })
})

describe('supplierCityForService', () => {
  const dayTrip = { city: 'Alexandria', overnight_city: 'Cairo' }
  it('a hotel night is booked where the night is; the day’s lunch where the day is', () => {
    expect(supplierCityForService('accommodation', dayTrip)).toBe('Cairo')
    expect(supplierCityForService('meal', dayTrip)).toBe('Alexandria')
    expect(supplierCityForService('transportation', dayTrip)).toBe('Alexandria')
  })
  it('a ship night ("On board …") looks in the day’s city — where the ship is', () => {
    expect(supplierCityForService('cruise', { city: 'Luxor', overnight_city: 'On board Sonesta' })).toBe('Luxor')
  })
  it('no overnight city: the day’s; no city at all: none', () => {
    expect(supplierCityForService('accommodation', { city: 'Aswan', overnight_city: null })).toBe('Aswan')
    expect(supplierCityForService('meal', { city: ' ' })).toBeNull()
  })
})

describe('groupSuppliersByCity', () => {
  const s = (id: string, name: string, city: string | null) => ({ id, name, city })
  it('the city’s suppliers first, then the same kind elsewhere by city — none twice', () => {
    const here = [s('2', 'Zooba', 'Cairo'), s('1', 'Abou El Sid', 'Cairo')]
    const all = [...here, s('3', 'Fish Market', 'Alexandria'), s('4', 'Sofra', 'Luxor'), s('5', 'Nameless', null)]
    const g = groupSuppliersByCity(here, all)
    expect(g.inCity.map(x => x.name)).toEqual(['Abou El Sid', 'Zooba'])
    expect(g.otherCities.map(x => x.name)).toEqual(['Fish Market', 'Sofra', 'Nameless'])
  })
})

describe('the itinerary editor', () => {
  const page = readFileSync(join(__dirname, '..', '..', 'app', 'itineraries', '[id]', 'edit', 'page.tsx'), 'utf8')
  it('no longer lists "All Other Suppliers"; each line asks for its kind in its city', () => {
    expect(page).not.toMatch(/All Other Suppliers/)
    expect(page).toMatch(/<ServiceSupplierSelect[\s\S]{0,200}city=\{supplierCityForService\(service\.service_type, day\)\}/)
  })
  it('picking the day’s city no longer moves its night', () => {
    expect(page).not.toMatch(/updateDay\(day\.id, \{ city, overnight_city: city \}\)/)
  })
})
