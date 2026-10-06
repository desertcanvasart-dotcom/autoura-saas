import { describe, it, expect } from 'vitest'
import { serviceLabel, serviceTypeLabel, splitSystemNote } from '@/lib/itineraries/display'

// Live ITN-S-2026-8987, Day 1 (2026-10-06 screenshot).
describe('service names saved as codes', () => {
  it('read as words; codes and city names keep their capitals', () => {
    expect(serviceLabel('airport_transfer sedan Cairo')).toBe('Airport transfer sedan Cairo')
    expect(serviceLabel('full_service CAI')).toBe('Full service CAI')
    expect(serviceLabel('checkin_assist')).toBe('Check-in assist')
  })

  it('a name written for people is left exactly as it is', () => {
    expect(serviceLabel('Marriott Mena House | Cairo')).toBe('Marriott Mena House | Cairo')
    expect(serviceLabel('Water Bottles')).toBe('Water Bottles')
    expect(serviceLabel(null)).toBe('')
  })

  it('types read as words', () => {
    expect(serviceTypeLabel('hotel_service')).toBe('Hotel service')
    expect(serviceTypeLabel('airport_staff_service')).toBe('Airport staff service')
  })
})

describe('the Notes box', () => {
  it('what the Pricing Grid wrote is the source, not a note', () => {
    expect(splitSystemNote('Created via Pricing Grid | B2C | 2 pax')).toEqual({ source: 'Pricing Grid · B2C · 2 pax', note: null })
  })

  it('a person’s note after it is kept as the note', () => {
    expect(splitSystemNote('Created via Pricing Grid | B2C | 2 pax\nVegetarian lunch on day 2')).toEqual({
      source: 'Pricing Grid · B2C · 2 pax',
      note: 'Vegetarian lunch on day 2',
    })
  })

  it('a note a person wrote stays a note', () => {
    expect(splitSystemNote('Client prefers early starts')).toEqual({ source: null, note: 'Client prefers early starts' })
    expect(splitSystemNote('')).toEqual({ source: null, note: null })
  })
})
