import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildServiceCancelMessage } from '@/lib/supplier-reply-link'

describe('telling a supplier the line is no longer needed', () => {
  it('names the service and its day, says please release it, and carries no price', () => {
    const m = buildServiceCancelMessage({ supplierName: 'Ahmed Cars', agency: 'Travel2Egypt', service: 'Airport pickup', serviceDate: '2026-11-03', serviceTime: '09:30:00' })
    expect(m.startsWith('Hello Ahmed,')).toBe(true)
    expect(m).toContain('from Travel2Egypt for Airport pickup on Tue, 3 Nov 2026 at 09:30 is no longer needed')
    expect(m).toContain('please release it')
    expect(m).not.toMatch(/\d+\.\d{2}/)
  })

  it('reads well with no date or agency', () => {
    const m = buildServiceCancelMessage({ service: 'Lunch' })
    expect(m).toContain('Hello there,')
    expect(m).toContain('The booking request for Lunch is no longer needed')
  })

  it('is offered only for a line that was asked and is now Not needed, and logged when sent', () => {
    const src = readFileSync('app/api/bookings/[id]/suppliers/[lineId]/request/route.ts', 'utf8')
    expect(src).toContain("status !== 'cancelled' || !line.requested_at")
    expect(src).toContain("kind: 'cancel_sent'")
    const panel = readFileSync('components/booking/BookingSuppliersPanel.tsx', 'utf8')
    expect(panel).toContain("normalizeStatus(r.status) === 'cancelled' && r.requested_at")
  })
})

describe("a line's history", () => {
  const src = readFileSync('app/api/bookings/[id]/suppliers/[lineId]/history/route.ts', 'utf8')

  it('reads the append-only events for that line in the caller’s company, newest first', () => {
    expect(src).toContain("from('service_booking_events')")
    expect(src).toContain(".eq('service_booking_id', lineId)")
    expect(src).toContain(".eq('tenant_id', tenant_id)")
    expect(src).toContain("order('occurred_at', { ascending: false })")
  })

  it('never writes', () => {
    expect(src).not.toMatch(/\.(insert|update|delete|upsert)\(/)
  })
})
