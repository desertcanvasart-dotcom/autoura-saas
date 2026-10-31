import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  buildCapacityWrite,
  groupByColumns,
  freeGroupSlots,
  capacityDateRange,
  DEFAULT_MAX_GROUPS,
} from '@/lib/capacity/capacity-write'
import { validatePaxFields, checkPaxAgainstRow } from '@/lib/departures/departure-pax'

// ============================================
// Documents audit, round 12 — part 4: capacity and departures
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

describe('saving a capacity day', () => {
  it('writes only the fields the request sends', () => {
    const w = buildCapacityWrite({ date: '2026-10-11', status: 'busy' })
    expect(w).toEqual({ ok: true, fields: { status: 'busy' } })
  })

  it('never defaults booked counts, max or notes it was not given', () => {
    const w = buildCapacityWrite({ max_groups: 5 })
    if (!w.ok) throw new Error(w.error)
    expect(w.fields).not.toHaveProperty('booked_groups')
    expect(w.fields).not.toHaveProperty('booked_guides')
    expect(w.fields).not.toHaveProperty('booked_vehicles')
    expect(w.fields).not.toHaveProperty('internal_notes')
    expect(w.fields).not.toHaveProperty('notes')
    expect(w.fields).not.toHaveProperty('status')
  })

  it('keeps explicit values, including an explicit null for optional ones', () => {
    const w = buildCapacityWrite({
      booked_groups: 2, booked_guides: 1, max_vehicles: null, internal_notes: null, notes: 'x',
    })
    expect(w).toEqual({
      ok: true,
      fields: { booked_groups: 2, booked_guides: 1, max_vehicles: null, internal_notes: null, notes: 'x' },
    })
  })

  it('ignores keys that are present but undefined, and unknown keys', () => {
    const w = buildCapacityWrite({ notes: undefined, id: 'abc', created_at: 'x', status: 'limited' })
    expect(w).toEqual({ ok: true, fields: { status: 'limited' } })
  })

  it('rejects bad statuses and counts', () => {
    expect(buildCapacityWrite({ status: 'closed' }).ok).toBe(false)
    expect(buildCapacityWrite({ booked_groups: -1 }).ok).toBe(false)
    expect(buildCapacityWrite({ max_groups: 2.5 }).ok).toBe(false)
    expect(buildCapacityWrite({ max_groups: '3' }).ok).toBe(false)
    expect(buildCapacityWrite({ booked_groups: null }).ok).toBe(false)
    expect(buildCapacityWrite({ notes: 5 }).ok).toBe(false)
  })

  it('batches a bulk save by column set so one row cannot null another', () => {
    const rows = [
      { date: 'a', status: 'busy' },
      { date: 'b', booked_groups: 1 },
      { status: 'limited', date: 'c' },
    ]
    const groups = groupByColumns(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].map(r => r.date)).toEqual(['a', 'c'])
    expect(groups[1].map(r => r.date)).toEqual(['b'])
  })

  it('is wired into both capacity save routes', () => {
    for (const f of ['app/api/capacity/route.ts', 'app/api/capacity/[date]/route.ts']) {
      const code = src(f)
      expect(code).toContain('buildCapacityWrite(')
      expect(code).not.toContain('booked_groups ?? 0')
      expect(code).not.toContain('booked_guides ?? 0')
      expect(code).not.toContain('booked_vehicles ?? 0')
    }
    expect(src('app/api/capacity/route.ts')).toContain('groupByColumns(preparedEntries)')
  })
})

describe('capacity check', () => {
  it('a day with no entry has the default capacity free', () => {
    expect(freeGroupSlots(null)).toBe(DEFAULT_MAX_GROUPS)
    expect(freeGroupSlots(undefined)).toBe(3)
  })

  it('free slots never go negative', () => {
    expect(freeGroupSlots({ max_groups: 2, booked_groups: 5 })).toBe(0)
    expect(freeGroupSlots({ max_groups: 4, booked_groups: 1 })).toBe(3)
  })

  it('steps dates by the calendar, across month, year and DST changes', () => {
    expect(capacityDateRange('2026-10-24', '2026-10-27')).toEqual([
      '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27',
    ])
    expect(capacityDateRange('2026-12-31', '2027-01-01')).toEqual(['2026-12-31', '2027-01-01'])
    expect(capacityDateRange('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
    expect(capacityDateRange('2026-10-11', '2026-10-11')).toEqual(['2026-10-11'])
    expect(capacityDateRange('2026-10-12', '2026-10-11')).toEqual([])
  })

  it('refuses an unbounded range', () => {
    expect(capacityDateRange('2026-01-01', '2030-01-01')).toBeNull()
    expect(capacityDateRange('2026-01-01', '2026-12-31')).toHaveLength(365)
  })

  it('is wired into the check route', () => {
    const code = src('app/api/capacity/check/route.ts')
    expect(code).toContain('capacityDateRange(start_date, effectiveEndDate)')
    // Counted like a booking is checked: live bookings + the calendar (lib/capacity/booking-capacity).
    expect(code).toContain('loadDayLoads(')
    expect(code).not.toContain('3 - group_size')
    expect(code).not.toContain('setDate(')
  })
})

describe('departure seats', () => {
  const row = { max_pax: 20, min_pax: 2, booked_pax: 12 }

  it('refuses max seats below the seats already booked', () => {
    const r = checkPaxAgainstRow({ max_pax: 8 }, row)
    expect(r).toMatchObject({ ok: false, status: 409 })
    expect(checkPaxAgainstRow({ max_pax: 12 }, row).ok).toBe(true)
  })

  it('only whole, non-negative pax counts', () => {
    expect(validatePaxFields({ max_pax: -1 }).ok).toBe(false)
    expect(validatePaxFields({ max_pax: 0 }).ok).toBe(false)
    expect(validatePaxFields({ max_pax: 2.5 }).ok).toBe(false)
    expect(validatePaxFields({ max_pax: '20' }).ok).toBe(false)
    expect(validatePaxFields({ min_pax: -2 }).ok).toBe(false)
    expect(validatePaxFields({ min_pax: null }).ok).toBe(true)
    expect(validatePaxFields({ min_pax: 0, max_pax: 1 }).ok).toBe(true)
    expect(validatePaxFields({ status: 'open' }).ok).toBe(true)
  })

  it('min can not exceed max, using the stored side when only one is sent', () => {
    expect(checkPaxAgainstRow({ min_pax: 10, max_pax: 15 }, row).ok).toBe(true)
    expect(checkPaxAgainstRow({ min_pax: 16, max_pax: 15 }, row)).toMatchObject({ ok: false, status: 400 })
    expect(checkPaxAgainstRow({ min_pax: 21 }, row)).toMatchObject({ ok: false, status: 400 })
    expect(checkPaxAgainstRow({ max_pax: 13 }, { ...row, min_pax: 14 })).toMatchObject({ ok: false, status: 400 })
  })

  it('is wired into PUT /api/departures/[id], and booked_pax is not writable', () => {
    const code = src('app/api/departures/[id]/route.ts')
    expect(code).toContain('validatePaxFields(updateData)')
    expect(code).toContain('checkPaxAgainstRow(updateData, current)')
    expect(code).not.toContain("'min_pax', 'booked_pax'")
  })
})

describe('cloning a departure', () => {
  it('carries the source currency into the create form', () => {
    const page = src('app/departures/_views/DeparturesListView.tsx')
    expect(page).toContain("currency: d.currency || 'EUR'")
    expect(page).toContain('Price per Person ({newDeparture.currency})')
    expect(page).not.toContain('Price per Person (EUR)')
  })
})
