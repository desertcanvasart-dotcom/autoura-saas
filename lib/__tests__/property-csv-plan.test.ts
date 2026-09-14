// ============================================
// The properties edit sheet decides correctly, or refuses out loud
// ============================================
// One row per property, edited in a spreadsheet and imported back (the user's
// request, 2026-09-14). Unlike the suppliers import this one UPDATES, so every
// way a row can be misread is a way to corrupt real data. planPropertyCsv makes
// all of those judgements without a database, and this is where they are pinned.
import { describe, it, expect } from 'vitest'
import { planPropertyCsv, type PropertyCsvRow, type SupplierRef } from '@/lib/suppliers/property-csv-plan'

const TENANT = 'tenant-1'

const SUPPLIERS: SupplierRef[] = [
  { id: 'sup-hotel', name: 'Nile Star Group', supplier_code: 'SUP-0001', types: ['hotel'] },
  { id: 'sup-cruise', name: 'Sunboat Cruises', supplier_code: 'SUP-0002', types: ['nile_cruise_line'] },
  { id: 'sup-both', name: 'Nile Fleet', supplier_code: 'SUP-0003', types: ['hotel', 'cruise'] },
  { id: 'sup-none', name: 'Koshary Abou Tarek', supplier_code: 'SUP-0004', types: ['restaurant'] },
]

const EXISTING = [
  { id: 'prop-1', supplier_id: 'sup-hotel', property_type: 'hotel', name: 'Nile Star Cairo' },
  { id: 'prop-2', supplier_id: 'sup-cruise', property_type: 'ship', name: 'MS Hapi' },
]

// The tenant's own words map onto behaviours; 'nile_cruise_line' behaves as a cruise.
const BEHAVIORS: Record<string, string> = { nile_cruise_line: 'cruise' }
const behaviorOf = (key: string) => BEHAVIORS[key] ?? key

const ACCOMMODATION = [
  { key: 'resort', label: 'Resort' },
  { key: 'city_hotel', label: 'City Hotel' },
]

function plan(rows: Array<Partial<PropertyCsvRow>>) {
  return planPropertyCsv({
    rows: rows.map((r, i) => ({ row: i + 2, ...r })) as PropertyCsvRow[],
    tenantId: TENANT,
    suppliers: SUPPLIERS,
    existing: EXISTING,
    behaviorOf,
    accommodationVocab: ACCOMMODATION,
  })
}

describe('finding the supplier', () => {
  it('prefers the portable code', () => {
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Isis' }])
    expect(r.refused).toEqual([])
    expect(r.creates[0]).toMatchObject({ supplier_id: 'sup-cruise', tenant_id: TENANT })
  })

  it('falls back to the name when the sheet carries no codes', () => {
    const r = plan([{ supplier_name: 'Sunboat Cruises', property_type: 'ship', name: 'MS Isis' }])
    expect(r.creates[0]).toMatchObject({ supplier_id: 'sup-cruise' })
  })

  it('refuses a supplier this workspace does not have, naming it', () => {
    const r = plan([{ supplier_code: 'SUP-9999', property_type: 'ship', name: 'MS Ghost' }])
    expect(r.creates).toEqual([])
    expect(r.refused[0].reason).toMatch(/no supplier here matches code "SUP-9999"/)
  })

  it('refuses a row that names no supplier at all', () => {
    const r = plan([{ property_type: 'ship', name: 'MS Nobody' }])
    expect(r.refused[0].reason).toMatch(/nothing to attach the property to/)
  })
})

describe('which kind, and whether the supplier may own it', () => {
  it('infers a blank Kind when the roles allow exactly one', () => {
    const r = plan([{ supplier_code: 'SUP-0002', name: 'MS Isis' }])
    expect(r.creates[0]).toMatchObject({ property_type: 'ship' })
  })

  it('refuses a blank Kind when the roles allow more than one', () => {
    const r = plan([{ supplier_code: 'SUP-0003', name: 'Nefertari' }])
    expect(r.creates).toEqual([])
    expect(r.refused[0].reason).toMatch(/Kind is blank .* could own hotel or ship/)
  })

  it('refuses a kind the supplier does not own', () => {
    const r = plan([{ supplier_code: 'SUP-0001', property_type: 'ship', name: 'MS Wrong' }])
    expect(r.refused[0].reason).toMatch(/does not own a ship/)
  })

  it('refuses a supplier whose roles own nothing', () => {
    const r = plan([{ supplier_code: 'SUP-0004', name: 'Downtown Branch' }])
    expect(r.refused[0].reason).toMatch(/fills no role that owns properties/)
  })

  it('refuses a word that is not a kind at all', () => {
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'boat', name: 'MS Hapi' }])
    expect(r.refused[0].reason).toMatch(/"boat" is not a kind of property/)
  })
})

describe('update, create, or rename', () => {
  it('updates the property the natural key matches', () => {
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Hapi', city: 'Luxor' }])
    expect(r.creates).toEqual([])
    expect(r.updates).toEqual([{ id: 'prop-2', patch: expect.objectContaining({ city: 'Luxor' }) }])
  })

  it('matches the natural key case-insensitively', () => {
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'ms hapi', city: 'Luxor' }])
    expect(r.updates[0].id).toBe('prop-2')
  })

  it('creates when nothing matches', () => {
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Isis' }])
    expect(r.updates).toEqual([])
    expect(r.creates[0]).toMatchObject({ name: 'MS Isis', property_type: 'ship' })
  })

  it('RENAMES when the id is present — the only way a rename can work', () => {
    const r = plan([{ id: 'prop-2', supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Hapi II' }])
    expect(r.creates).toEqual([])
    expect(r.updates).toEqual([{ id: 'prop-2', patch: expect.objectContaining({ name: 'MS Hapi II' }) }])
  })

  it('refuses an id this workspace does not have rather than creating one', () => {
    const r = plan([{ id: 'prop-ghost', supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS X' }])
    expect(r.creates).toEqual([])
    expect(r.refused[0].reason).toMatch(/is not a property in this workspace/)
  })

  it('refuses to move a property to a different supplier', () => {
    // Re-pointing an asset is not an edit; doing it silently rewrites history
    // on both suppliers.
    const r = plan([{ id: 'prop-2', supplier_code: 'SUP-0001', property_type: 'hotel', name: 'MS Hapi' }])
    expect(r.updates).toEqual([])
    expect(r.refused[0].reason).toMatch(/belongs to a different supplier/)
  })

  it('refuses two rows aimed at the same property, naming the first', () => {
    const r = plan([
      { supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Isis', city: 'Aswan' },
      { supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Isis', city: 'Luxor' },
    ])
    expect(r.creates).toHaveLength(1)
    expect(r.refused[0].reason).toMatch(/already set by row 2/)
  })

  it('refuses a new row with no Name', () => {
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship' }])
    expect(r.refused[0].reason).toMatch(/missing Name/)
  })
})

describe('the cells', () => {
  it('clears a field when its cell is emptied — that is what an edit sheet means', () => {
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Hapi', contact_phone: '' }])
    expect(r.updates[0].patch.contact_phone).toBeNull()
  })

  it('resolves the agency\'s accommodation word to its key', () => {
    const r = plan([{ supplier_code: 'SUP-0001', property_type: 'hotel', name: 'Nile Star Cairo', accommodation_type: 'Resort' }])
    expect(r.updates[0].patch.accommodation_type).toBe('resort')
  })

  it('refuses an accommodation word the agency does not use', () => {
    const r = plan([{ supplier_code: 'SUP-0001', property_type: 'hotel', name: 'Nile Star Cairo', accommodation_type: 'Igloo' }])
    expect(r.updates).toEqual([])
    expect(r.refused[0].reason).toMatch(/not in your accommodation types/)
  })

  it('refuses an accommodation type on something that is not a hotel', () => {
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Hapi', accommodation_type: 'Resort' }])
    expect(r.refused[0].reason).toMatch(/Accommodation Type is for hotels/)
  })

  it('reads the booleans a spreadsheet actually writes', () => {
    for (const [cell, expected] of [['TRUE', true], ['yes', true], ['0', false], ['inactive', false]] as const) {
      const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Hapi', is_active: cell }])
      expect(r.updates[0].patch.is_active, cell).toBe(expected)
    }
  })

  it('refuses an Active cell it does not understand instead of deactivating', () => {
    // Treating "maybe" as false would retire a property nobody meant to retire.
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Hapi', is_active: 'maybe' }])
    expect(r.updates).toEqual([])
    expect(r.refused[0].reason).toMatch(/Active says "maybe" — write true or false/)
  })

  it('leaves Active alone when the cell is blank', () => {
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Hapi', is_active: '' }])
    expect(r.updates[0].patch).not.toHaveProperty('is_active')
  })
})

describe('what it will never do', () => {
  it('never deletes: a property absent from the file is untouched', () => {
    // A filtered export must not become a wipe.
    const r = plan([{ supplier_code: 'SUP-0002', property_type: 'ship', name: 'MS Hapi' }])
    expect(r.updates.map(u => u.id)).toEqual(['prop-2'])
    expect(JSON.stringify(r)).not.toMatch(/prop-1/) // the untouched hotel
  })
})
