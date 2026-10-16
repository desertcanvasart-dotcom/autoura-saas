import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { distinctiveHotelName, hotelsMentioned, namedHotelFor } from '@/lib/pricing/hotel-mentions'
import { hotelForTier } from '@/app/pricing-grid/lib/option-item'
import type { RateOption } from '@/app/pricing-grid/types'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const HOTELS = [
  { id: 'mena-std', name: 'Marriott Mena House', city: 'Giza', tier: 'standard' },
  { id: 'mena-lux', name: 'Marriott Mena House', city: 'Giza', tier: 'luxury' },
  { id: 'fs-cairo', name: 'Four Seasons Nile Plaza', city: 'Cairo', tier: 'luxury' },
  { id: 'steig-lux', name: 'Steigenberger Nile Palace', city: 'Luxor', tier: 'deluxe' },
  { id: 'grand', name: 'Grand Hotel', city: 'Aswan', tier: 'standard' },
]
const TEXT = '4-Day Stay at Marriott Mena House Tour Plan … transfer to the Mena House Hotel …'

describe('hotels named in the text', () => {
  it('keeps the words that identify the property', () => {
    expect(distinctiveHotelName('Marriott Mena House')).toBe('mena house')
    expect(distinctiveHotelName('Steigenberger Nile Palace')).toBe('nile palace')
    expect(distinctiveHotelName('Grand Hotel')).toBe('')
  })

  it('finds the named hotel, and only it', () => {
    expect(hotelsMentioned(TEXT, HOTELS).map(h => h.id)).toEqual(['mena-std', 'mena-lux'])
  })

  it('replaces another hotel the AI picked, preferring the selected tier', () => {
    const byId = new Map(HOTELS.map(h => [h.id, h]))
    const mentioned = hotelsMentioned(TEXT, HOTELS)
    // The AI took the first Cairo luxury hotel on a day it called "Cairo".
    expect(namedHotelFor('fs-cairo', 'Cairo', byId, mentioned, 'luxury')?.id).toBe('mena-lux')
    // Saved only as standard: still the named hotel.
    expect(namedHotelFor('fs-cairo', 'Cairo', byId, mentioned.filter(m => m.tier === 'standard'), 'luxury')?.id).toBe('mena-std')
    // Already right: nothing to change.
    expect(namedHotelFor('mena-lux', 'Giza', byId, mentioned, 'luxury')).toBeNull()
  })

  it('leaves the pick alone when the text names no hotel', () => {
    const byId = new Map(HOTELS.map(h => [h.id, h]))
    expect(namedHotelFor('fs-cairo', 'Cairo', byId, hotelsMentioned('A week in Egypt', HOTELS), 'luxury')).toBeNull()
  })
})

describe('switching tier on the grid', () => {
  const opt = (id: string, name: string, city: string): RateOption =>
    ({ id, name, city, rateEur: 100, rateNonEur: 100 }) as RateOption
  const luxury = [
    opt('fs', 'Four Seasons Nile Plaza Cairo (luxury | BB)', 'Cairo'),
    opt('mena', 'Marriott Mena House Giza (luxury | BB)', 'Giza'),
  ]
  it('keeps the same hotel when the new tier has it', () => {
    expect(hotelForTier({ name: 'Marriott Mena House Giza (standard | BB)' }, 'Cairo', luxury)?.id).toBe('mena')
  })
  it('otherwise stays in the hotel\'s own city before the day\'s', () => {
    const noMena = [luxury[0], opt('oberoi', 'Oberoi Sahl Giza (luxury | BB)', 'Giza')]
    expect(hotelForTier({ name: 'Marriott Mena House Giza (standard | BB)' }, 'Cairo', noMena)?.id).toBe('oberoi')
  })
})

describe('the parser reads hotels the form saved', () => {
  it('reads property_name and prices from the periods, across every tier', () => {
    const src = read('app/api/pricing-grid/parse/route.ts')
    expect(src).toContain('property_name')
    expect(src).toContain('gridHotelRate(r, startDate)')
    expect(src).not.toMatch(/from\('accommodation_rates'\)[^\n]*\.eq\('tier', tier\)/)
    expect(src).toContain('namedHotelFor(')
  })
})
