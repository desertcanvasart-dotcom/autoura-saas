import { describe, it, expect } from 'vitest'
import { generatedOvernightCity, hotelNightsForGeneratedDays } from '@/lib/ai/service-creation'

// Live 2026-10-06: Day 3 "Exciting Day Trip to Alexandria" — "… Return to
// Cairo for overnight." — was saved as "Overnight in Alexandria", because the
// AI echoed the day's city as overnight_city and the generator trusted it.
const dayTrip = {
  city: 'Alexandria',
  overnight_city: 'Alexandria',
  description: "Full day trip to Alexandria visiting Catacombs of Kom El Shoqafa and Al Muntazah Park. Return to Cairo for overnight.",
}

describe('generatedOvernightCity — a day trip does not move the bed', () => {
  it('a day trip that says it returns keeps the night before', () => {
    expect(generatedOvernightCity(dayTrip, 'Cairo')).toBe('Cairo')
  })

  it('the return can be in the activities', () => {
    const d = { city: 'Alexandria', overnight_city: 'Alexandria', activities: ['Visit Qaitbay Citadel', 'Drive back to Cairo'] }
    expect(generatedOvernightCity(d, 'Cairo')).toBe('Cairo')
  })

  it('a real move keeps the AI\'s city', () => {
    const d = { city: 'Alexandria', overnight_city: 'Alexandria', description: 'Drive to Alexandria and check in to your hotel.' }
    expect(generatedOvernightCity(d, 'Cairo')).toBe('Alexandria')
  })

  it('an overnight city other than the day\'s is the AI\'s call', () => {
    expect(generatedOvernightCity({ ...dayTrip, overnight_city: 'Giza' }, 'Cairo')).toBe('Giza')
  })

  it('a transfer day keeps what the AI gave', () => {
    expect(generatedOvernightCity({ ...dayTrip, is_transfer_only: true }, 'Cairo')).toBe('Alexandria')
  })

  it('with no overnight city, the night before; the first night has none', () => {
    expect(generatedOvernightCity({ city: 'Alexandria' }, 'Cairo')).toBe('Cairo')
    expect(generatedOvernightCity(dayTrip, null)).toBe('Alexandria')
  })
})

describe('hotelNightsForGeneratedDays — the hotel is booked where the bed is', () => {
  it('the day trip\'s hotel night is in Cairo', () => {
    const days = [
      { day_number: 1, city: 'Cairo', overnight_city: 'Cairo' },
      { day_number: 2, city: 'Giza', overnight_city: 'Cairo' },
      { day_number: 3, ...dayTrip },
      { day_number: 4, city: 'Cairo', overnight_city: 'Cairo' },
    ]
    const nights = hotelNightsForGeneratedDays(days, { durationDays: 4, effectiveCity: 'Cairo', includeAccommodationFinal: true })
    expect(nights).toEqual([
      { day: 1, city: 'Cairo' },
      { day: 2, city: 'Cairo' },
      { day: 3, city: 'Cairo' },
    ])
  })
})
