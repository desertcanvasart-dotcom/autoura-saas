import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildClientDayMessage, dayHasDetails, linesForDay, serviceDays, tomorrowOf, type DayLine } from '@/lib/bookings/client-day-message'

const line = (over: Partial<DayLine>): DayLine => ({
  id: Math.random().toString(36).slice(2), status: 'assigned', service_date: '2026-11-04', service_time: '09:30:00',
  service_description: 'Airport pickup', supplier_type: 'transport', pickup_location: 'Cairo Airport', dropoff_location: 'Mena House',
  assigned_vehicle_plate: 'ABC 123', assigned_guide_name: null, assigned_guide_phone: null, driver_note: 'Mohamed 0100 123 4567', ...over,
})

describe("the client's day details", () => {
  it('tomorrow: time, service, pickup, drop-off, car, driver — signed by the agency', () => {
    const m = buildClientDayMessage({ clientName: 'Tersa Smith', agency: 'Travel2Egypt', date: '2026-11-04', lines: [line({})], isTomorrow: true })
    expect(m).toBe([
      'Hello Tersa,', '',
      'Here are your details for tomorrow, Wednesday 4 November:', '',
      '🕘 09:30 · Airport pickup',
      '📍 Pickup: Cairo Airport',
      '🏁 Drop-off: Mena House',
      '🚗 Car: ABC 123',
      '👤 Driver: Mohamed 0100 123 4567', '',
      'Have a wonderful day! — Travel2Egypt',
    ].join('\n'))
  })

  it('the guide with their phone', () => {
    const m = buildClientDayMessage({ date: '2026-11-04', isTomorrow: false, lines: [line({ supplier_type: 'guide', service_description: null, assigned_vehicle_plate: null, driver_note: null, assigned_guide_name: 'Ali', assigned_guide_phone: '+20 100' })] })
    expect(m).toContain('Here are your details for Wednesday 4 November:')
    expect(m).toContain('🕘 09:30 · Guide')
    expect(m).toContain('🧭 Guide: Ali (+20 100)')
  })

  it('a line nobody covered shows its time and service, never a car', () => {
    const m = buildClientDayMessage({ date: '2026-11-04', isTomorrow: true, lines: [line({ status: 'requested' })] })
    expect(m).toContain('🕘 09:30 · Airport pickup')
    expect(m).not.toContain('ABC 123')
    expect(m).not.toContain('Mohamed')
  })

  it('no prices and no supplier names', () => {
    const m = buildClientDayMessage({ date: '2026-11-04', isTomorrow: true, lines: [line({})] })
    expect(m).not.toMatch(/\d+\.\d{2}/)
    expect(m).not.toContain('Blue Nile')
  })

  it("the day's lines: Not needed left out, in time order, untimed last", () => {
    const lines = [
      line({ service_time: null, service_description: 'Lunch' }),
      line({ service_time: '14:00:00', service_description: 'Felucca' }),
      line({ service_time: '08:00:00', service_description: 'Pickup' }),
      line({ status: 'cancelled', service_description: 'Dropped' }),
      line({ service_date: '2026-11-05', service_description: 'Next day' }),
    ]
    expect(linesForDay(lines, '2026-11-04').map(l => l.service_description)).toEqual(['Pickup', 'Felucca', 'Lunch'])
    expect(serviceDays(lines)).toEqual(['2026-11-04', '2026-11-05'])
  })

  it('a day has details once a covered line names a car, guide or driver', () => {
    expect(dayHasDetails([line({})])).toBe(true)
    expect(dayHasDetails([line({ status: 'requested' })])).toBe(false)
    expect(dayHasDetails([line({ assigned_vehicle_plate: null, driver_note: null })])).toBe(false)
  })

  it('tomorrow is the next UTC day, across a month end', () => {
    expect(tomorrowOf(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01')
  })
})

describe('sent from the office, nudged in the morning', () => {
  it('the route is company-scoped and logs the send on each of the day’s lines', () => {
    const src = readFileSync('app/api/bookings/[id]/client-day-message/route.ts', 'utf8')
    expect(src).toContain(".eq('booking_id', bookingId).eq('tenant_id', tenantId)")
    expect(src).toContain('kind: CLIENT_TOLD, date: body.date')
    expect(src).toContain("roleDenied(auth.role, 'manage')")
  })

  it('the morning job only rings the bell — nothing to a client — and skips a booking already told', () => {
    const src = readFileSync('app/api/cron/client-day-reminders/route.ts', 'utf8')
    expect(src).toContain('notifyTeam')
    expect(src).not.toMatch(/generateWhatsAppLink|sendEmail|resend|twilio/i)
    expect(src).toContain(".eq('details->>kind', CLIENT_TOLD).eq('details->>date', day)")
    expect(readFileSync('scripts/cron-reminders.mjs', 'utf8')).toContain('/api/cron/client-day-reminders')
  })
})
