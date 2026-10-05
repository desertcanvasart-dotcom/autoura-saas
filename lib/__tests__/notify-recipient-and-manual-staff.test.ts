// Checked 2026-10-06 before adding manual entry to the driver / airport staff /
// hotel staff pickers. The pickers loaded correctly; WhatsApp notify did not:
// it looked every person up in `suppliers`, so airport and hotel staff always
// got "Resource not found", and the driver button did nothing at all.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { findRecipient } from '@/lib/notify/find-recipient'

/** A Supabase double: tables of rows; .select().eq().eq().maybeSingle(). */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  const asked: string[] = []
  return {
    asked,
    from(table: string) {
      asked.push(table)
      const filters: Record<string, unknown> = {}
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => { filters[col] = val; return q },
        maybeSingle: async () => ({
          data: (tables[table] ?? []).find(r => Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null,
        }),
      }
      return q
    },
  }
}

describe('findRecipient', () => {
  it('finds airport staff in airport_staff, WhatsApp number first', async () => {
    const db = fakeDb({ airport_staff: [{ id: 'a1', tenant_id: 't1', name: 'Mona', phone: '+20 1', whatsapp: '+20 2' }] })
    expect(await findRecipient(db, 't1', 'airport_staff', 'a1')).toEqual({ name: 'Mona', phone: '+20 2' })
    expect(db.asked).toEqual(['airport_staff'])
  })

  it('finds hotel staff and drivers where they live', async () => {
    const db = fakeDb({
      hotel_staff: [{ id: 'h1', tenant_id: 't1', name: 'Karim', phone: '+20 3' }],
      team_members: [{ id: 'd1', tenant_id: 't1', name: 'Sayed', phone: '+20 4', whatsapp: null }],
    })
    expect(await findRecipient(db, 't1', 'hotel_staff', 'h1')).toEqual({ name: 'Karim', phone: '+20 3' })
    expect(await findRecipient(db, 't1', 'driver', 'd1')).toEqual({ name: 'Sayed', phone: '+20 4' })
  })

  it('finds a restaurant in the directory, else its supplier', async () => {
    const db = fakeDb({
      restaurant_contacts: [{ id: 'r1', tenant_id: 't1', name: 'Abou El Sid', phone: '+20 5' }],
      suppliers: [{ id: 's1', tenant_id: 't1', name: 'Zooba', contact_phone: '+20 6' }],
    })
    expect(await findRecipient(db, 't1', 'restaurant', 'r1')).toEqual({ name: 'Abou El Sid', phone: '+20 5' })
    expect(await findRecipient(db, 't1', 'restaurant', 's1')).toEqual({ name: 'Zooba', phone: '+20 6' })
  })

  it('never reaches another tenant, and says so when nobody matches', async () => {
    const db = fakeDb({ airport_staff: [{ id: 'a1', tenant_id: 'other', name: 'Mona', phone: '+20 1' }] })
    expect(await findRecipient(db, 't1', 'airport_staff', 'a1')).toBeNull()
  })
})

describe('the picker', () => {
  const src = readFileSync(join(process.cwd(), 'app/components/ResourceAssignmentV2.tsx'), 'utf8')

  it('lets drivers, airport staff and hotel staff be typed in by hand — and nothing else', () => {
    const flagged = [...src.matchAll(/key: '([a-z_]+)',[\s\S]*?(?=\n  \{|\n\])/g)]
      .filter(m => m[0].includes('allowManual: true'))
      .map(m => m[1])
    expect(flagged.sort()).toEqual(['airport_staff', 'driver', 'hotel_staff'])
  })

  it('gives a typed-in person a fresh id and keeps their phone in the name', () => {
    expect(src).toContain('resourceId = crypto.randomUUID()')
    expect(src).toMatch(/resourceName = `\$\{manualName\.trim\(\)\}\$\{phone \? ` · \$\{phone\}` : ''\} \(outside\)`/)
  })

  it('sends drivers through the notify route instead of silently doing nothing', () => {
    expect(src).toContain("['restaurant', 'airport_staff', 'hotel_staff', 'driver'].includes(resource.resource_type)")
  })
})

describe('the notify route', () => {
  it('looks people up by type, not in suppliers alone', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/whatsapp/notify-resource/route.ts'), 'utf8')
    expect(route).toContain('findRecipient(supabase, authResult.tenant_id, resourceType, resourceId)')
    expect(route).not.toMatch(/from\('suppliers'\)/)
  })
})
