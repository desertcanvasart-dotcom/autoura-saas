import { describe, it, expect } from 'vitest'
import { buildPickupMessage } from '@/lib/notify/pickup-message'

describe('the pickup details message', () => {
  it('when, where and who — with numbers to call', () => {
    expect(buildPickupMessage({
      agency: 'Travel2Egypt', clientName: 'Tersa Smith', tripName: 'Cairo & Alexandria Classic',
      date: '2026-10-02', dayNumber: 2, time: '08:00', place: 'Marriott Mena House lobby',
      guide: { name: 'Amr Hassan', phone: '+20 100 111 2222' }, driver: { name: 'Sayed', phone: '01001234567' },
      vehicle: 'Toyota HiAce (8 pax)',
    })).toBe([
      'Hello Tersa,',
      '',
      'Here are your pickup details for Friday, 2 October (day 2 of Cairo & Alexandria Classic):',
      '',
      '🕐 Pickup time: 08:00',
      '📍 Pickup point: Marriott Mena House lobby',
      '🧭 Your guide: Amr Hassan (+20 100 111 2222)',
      '🚐 Your driver: Sayed (01001234567) — Toyota HiAce (8 pax)',
      '',
      'Please be ready a few minutes early. If anything changes, reply to this message.',
      '',
      'Travel2Egypt team',
    ].join('\n'))
  })

  it('says what is not settled rather than leaving a gap; names nobody not booked', () => {
    const text = buildPickupMessage({ date: '2026-10-01', airport: { name: 'Mona' } })
    expect(text).toContain('🕐 Pickup time: to be confirmed')
    expect(text).toContain('📍 Pickup point: to be confirmed')
    expect(text).toContain('🛬 Meeting you at the airport: Mona')
    expect(text).not.toContain('guide')
    expect(text).toContain('Your travel team')
  })
})
