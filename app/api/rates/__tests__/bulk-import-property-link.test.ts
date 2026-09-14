import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Re-importing a rate export must put the property back on the rate
// ============================================================================
// Reported 2026-09-14 from the Trains rates page: export the rates, delete
// them, import the very same file — and every row comes back with no train.
// The bulk importer knew nothing about `property_id`, so the link the rate
// FORMS resolve on every save was dropped on every bulk write.
//
// This exercises the real route against a stub database. The resolver itself
// (find-or-create by supplier + name) is covered in resolve-property.test.ts;
// what is pinned here is the wiring the bug was made of: that the importer
// resolves at all, that it resolves against THIS tenant's supplier, that the
// virtual column never reaches the insert, and that a row it could not link
// says so instead of going quiet.

const mockAuth = vi.fn()
const mockResolveProperty = vi.fn()

vi.mock('@/lib/supabase-server', () => ({ requireAuth: () => mockAuth() }))
vi.mock('@/lib/vocabulary-server', () => ({ loadVocabulary: async () => [] }))
vi.mock('@/lib/suppliers/resolve-property', () => ({
  resolveRateProperty: (...a: unknown[]) => mockResolveProperty(...a),
}))

const { POST } = await import('../bulk/import/route')

const TENANT = 'tenant-1'
const SUPPLIER = 'supplier-local-uuid'

/** Rows handed to .insert(), captured per table. */
let inserted: Record<string, unknown>[]

function stubDb() {
  const suppliers = {
    select: () => ({
      in: () => ({ eq: async () => ({ data: [{ id: SUPPLIER }] }) }),
    }),
  }
  const rateTable = {
    select: () => ({ in: () => ({ eq: async () => ({ data: [] }) }) }), // nothing exists yet
    insert: async (rows: Record<string, unknown>[]) => { inserted.push(...rows); return { error: null } },
  }
  return { from: (t: string) => (t === 'suppliers' ? suppliers : rateTable) }
}

async function importCsv(csvData: string, table = 'train_rates') {
  const req = { json: async () => ({ table, csvData, dryRun: false }) }
  return (await POST(req as never)).json()
}

const HEADER = 'service_code,origin_city,destination_city,class_type,rate_eur,supplier_id,property_name'

beforeEach(() => {
  vi.clearAllMocks()
  inserted = []
  mockAuth.mockResolvedValue({ error: null, supabase: stubDb(), tenant_id: TENANT })
  mockResolveProperty.mockResolvedValue({ property_id: 'property-uuid', name: 'Nefertari Express' })
})

describe('bulk import restores the property link', () => {
  it('resolves the named train under the row\'s own supplier', async () => {
    const res = await importCsv(`${HEADER}\nTRN-1,Cairo,Luxor,first,45,${SUPPLIER},Nefertari Express`)
    expect(res.inserted).toBe(1)

    expect(mockResolveProperty).toHaveBeenCalledTimes(1)
    expect(mockResolveProperty.mock.calls[0][1]).toMatchObject({
      tenantId: TENANT,
      propertyType: 'train',
      supplierId: SUPPLIER,
      name: 'Nefertari Express',
    })
    expect(inserted[0].property_id).toBe('property-uuid')
  })

  it('never lets the virtual column reach the insert', async () => {
    // No train table has a property_name column: leaving it on the record
    // fails the whole batch on an unknown column.
    await importCsv(`${HEADER}\nTRN-1,Cairo,Luxor,first,45,${SUPPLIER},Nefertari Express`)
    expect(inserted[0]).not.toHaveProperty('property_name')
  })

  it('resolves once per distinct train, not once per rate', async () => {
    await importCsv(
      `${HEADER}\n` +
      `TRN-1,Cairo,Luxor,first,45,${SUPPLIER},Nefertari Express\n` +
      `TRN-2,Luxor,Aswan,first,35,${SUPPLIER},Nefertari Express\n` +
      `TRN-3,Cairo,Aswan,second,60,${SUPPLIER},Hapi Express`
    )
    expect(inserted).toHaveLength(3)
    expect(mockResolveProperty).toHaveBeenCalledTimes(2)
  })

  it('a row with no supplier still imports, and the gap is reported', async () => {
    const res = await importCsv(`${HEADER}\nTRN-1,Cairo,Luxor,first,45,,Nefertari Express`)
    expect(res.inserted).toBe(1)
    expect(mockResolveProperty).not.toHaveBeenCalled()
    expect(res.propertyLinksUnresolved).toBe(1)
    expect(inserted[0].property_id).toBeUndefined()
    expect(inserted[0]).not.toHaveProperty('property_name')
  })

  it('a supplier this tenant does not have is cleared BEFORE the property is resolved', async () => {
    // Otherwise the property is hung off the other install's UUID.
    const res = await importCsv(`${HEADER}\nTRN-1,Cairo,Luxor,first,45,foreign-uuid,Nefertari Express`)
    expect(res.supplierLinksCleared).toBe(1)
    expect(mockResolveProperty).not.toHaveBeenCalled()
    expect(res.propertyLinksUnresolved).toBe(1)
  })

  it('a rate naming no property is left alone', async () => {
    const res = await importCsv(`${HEADER}\nTRN-1,Cairo,Luxor,first,45,${SUPPLIER},`)
    expect(res.inserted).toBe(1)
    expect(mockResolveProperty).not.toHaveBeenCalled()
    expect(res.propertyLinksUnresolved).toBe(0)
  })
})

describe('hotels and cruises use the name already on the rate row', () => {
  it('a hotel rate resolves its property from property_name, which stays a real column', async () => {
    mockResolveProperty.mockResolvedValue({ property_id: 'hotel-uuid', name: 'Nile Star' })
    const res = await importCsv(
      `service_code,property_name,supplier_id\nACC-1,Nile Star,${SUPPLIER}`,
      'accommodation_rates'
    )
    expect(res.inserted).toBe(1)
    expect(mockResolveProperty.mock.calls[0][1]).toMatchObject({ propertyType: 'hotel', name: 'Nile Star' })
    expect(inserted[0].property_id).toBe('hotel-uuid')
    // Not virtual — the hotel's name is a column of its own and must survive.
    expect(inserted[0].property_name).toBe('Nile Star')
  })

  it('a cruise resolves its ship from ship_name', async () => {
    mockResolveProperty.mockResolvedValue({ property_id: 'ship-uuid', name: 'MS Hapi' })
    const res = await importCsv(
      `cruise_code,ship_name,ship_category,route_name,embark_city,disembark_city,duration_nights,supplier_id\n` +
      `CRU-1,MS Hapi,deluxe,Luxor-Aswan,Luxor,Aswan,4,${SUPPLIER}`,
      'nile_cruises'
    )
    expect(res.inserted).toBe(1)
    expect(mockResolveProperty.mock.calls[0][1]).toMatchObject({ propertyType: 'ship', name: 'MS Hapi' })
    expect(inserted[0].property_id).toBe('ship-uuid')
    expect(inserted[0].ship_name).toBe('MS Hapi')
  })
})
