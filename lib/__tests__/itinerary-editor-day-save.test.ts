import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { daySavePlan, isSavedDayId, renumberDays } from '@/lib/itineraries/day-save-plan'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const PAGE = readFileSync(path.join(__dirname, '..', '..', 'app', 'itineraries', '[id]', 'edit', 'page.tsx'), 'utf8')

describe('itinerary editor — saving the days', () => {
  it('a removed saved day is deleted; a removed new one is not looked for', () => {
    const plan = daySavePlan({ days: [{ id: A, day_number: 1, saved_number: 1 }], removedIds: [B, 'new-1'], startDate: '2026-11-01' })
    expect(plan.toDelete).toEqual([B])
  })

  it('a reorder parks the moving days on numbers no day holds', () => {
    const days = renumberDays([{ id: B, day_number: 2, saved_number: 2 }, { id: A, day_number: 1, saved_number: 1 }, { id: C, day_number: 3, saved_number: 3 }])
    expect(days.map(d => d.day_number)).toEqual([1, 2, 3])
    const plan = daySavePlan({ days, removedIds: [], startDate: '2026-11-01' })
    expect(plan.toPark.map(p => p.id)).toEqual([B, A])
    const parked = plan.toPark.map(p => p.parkNumber)
    expect(new Set(parked).size).toBe(2)
    expect(Math.min(...parked)).toBeGreaterThan(3)
  })

  it('each day’s date follows its place in the trip', () => {
    const plan = daySavePlan({ days: [{ id: A, day_number: 1 }, { id: 'new-2', day_number: 2 }], removedIds: [], startDate: '2026-12-31' })
    expect(plan.dateOf(1)).toBe('2026-12-31')
    expect(plan.dateOf(2)).toBe('2027-01-01')
    expect(plan.endDate).toBe('2027-01-01')
    expect(daySavePlan({ days: [{ id: A, day_number: 1 }], removedIds: [], startDate: '' }).dateOf(1)).toBeNull()
  })

  it('renumbering returns new objects and leaves the old ones alone', () => {
    const old = [{ id: 'x', day_number: 3 }]
    const next = renumberDays(old)
    expect(next[0].day_number).toBe(1)
    expect(old[0].day_number).toBe(3)
    expect(isSavedDayId('new-abc')).toBe(false)
  })

  it('the page deletes removed days, dates every day, files new services by day id, and never saves 0 days', () => {
    expect(PAGE).toContain("for (const id of plan.toDelete) {")
    expect(PAGE).toContain('...(date ? { date } : {}),')
    expect(PAGE).toContain("const dayId = savedDayId.get(service.itinerary_day_id ?? '') ?? service.itinerary_day_id ?? ''")
    expect(PAGE).not.toContain('days.find(d => d.day_number === day_number)')
    expect(PAGE).toContain('...(days.length > 0 ? { total_days: days.length } : {}),')
    expect(PAGE).not.toContain('day.day_number = index + 1')
  })
})
