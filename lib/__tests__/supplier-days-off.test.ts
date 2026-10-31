import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkDayOff, cleanNote, offOn } from '@/lib/supplier-days-off'

describe('days a supplier cannot work', () => {
  it('a real date, from today, within a year', () => {
    expect(checkDayOff('2026-11-05', '2026-11-05')).toEqual({ ok: true, day: '2026-11-05' })
    expect(checkDayOff('2026-11-04', '2026-11-05')).toMatchObject({ ok: false, error: 'That day has passed' })
    expect(checkDayOff('2028-01-01', '2026-11-05')).toMatchObject({ ok: false })
    for (const bad of ['', '5/11/2026', '2026-13-01x', null, 42]) expect(checkDayOff(bad, '2026-11-05').ok, String(bad)).toBe(false)
  })

  it('a short, tidy note or none', () => {
    expect(cleanNote('  family   wedding ')).toBe('family wedding')
    expect(cleanNote('')).toBeNull()
    expect(cleanNote('x'.repeat(300))).toHaveLength(200)
  })

  it('who is off on a given day', () => {
    const rows = [{ supplier_id: 'a', day: '2026-11-10' }, { supplier_id: 'b', day: '2026-11-11' }]
    expect([...offOn(rows, '2026-11-10')]).toEqual(['a'])
    expect(offOn(rows, null).size).toBe(0)
  })
})

describe('a warning, never a block', () => {
  it('Who covers it marks a supplier (or own guide) who is off that day, and still offers them', () => {
    const cover = readFileSync('app/api/bookings/[id]/suppliers/[lineId]/cover/route.ts', 'utf8')
    expect(cover).toContain('day_off: off.has(o.supplier_id)')
    expect(cover).toContain('day_off: off.has(s.id as string)')
    expect(cover).toContain("o.resource_type === 'guide' && off.has(o.resource_id)")
    const picker = readFileSync('components/booking/CoverLinePicker.tsx', 'utf8')
    expect(picker).toContain("⚠ day off")
    // Not filtered out anywhere:
    expect(cover).not.toMatch(/filter\([^)]*day_off/)
  })

  it('the booking line says so when its supplier marked that day off', () => {
    expect(readFileSync('app/api/bookings/[id]/suppliers/route.ts', 'utf8')).toContain('supplier_day_off')
    expect(readFileSync('components/booking/BookingSuppliersPanel.tsx', 'utf8')).toContain('This supplier marked this day off')
  })

  it('from their page a supplier marks only their own days at that agency, and removes only what they marked', () => {
    const route = readFileSync('app/api/supplier-page/[token]/days-off/route.ts', 'utf8')
    expect(route).toContain('{ tenantId: link.tenant_id, supplierId: link.supplier_id }')
    expect(route).toContain(".is('revoked_at', null)")
    const writer = readFileSync('lib/supplier-days-off-write.ts', 'utf8')
    expect(writer).toContain(".eq('marked_by', 'supplier')")
    expect(writer).toContain("tenant_id: who.tenantId, supplier_id: who.supplierId")
  })

  it('the office route is managers-only for changes and scoped to its own suppliers', () => {
    const office = readFileSync('app/api/suppliers/[id]/days-off/route.ts', 'utf8')
    expect(office.match(/roleDenied\(auth\.role, 'manage'\)/g)?.length).toBe(2)
    expect(office).toContain(".eq('id', id).eq('tenant_id', tenant_id)")
  })
})
