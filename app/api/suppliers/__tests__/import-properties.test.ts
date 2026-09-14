import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Importing a supplier brings its properties with it
// ============================================================================
// Reported 2026-09-14: properties entered by hand on a supplier's Properties
// tab were absent from the exported CSV, and the importer had never heard of
// them. The Properties column now carries them, and this drives the real route
// against a stub database to pin how each row is placed — especially the cases
// where it must REFUSE to guess rather than file a ship under hotels.

const mockAuth = vi.fn()
const mockVocab = vi.fn()

vi.mock('@/lib/supabase-server', () => ({ requireAuth: () => mockAuth() }))
vi.mock('@/lib/vocabulary-server', () => ({ loadVocabulary: (...a: unknown[]) => mockVocab(...a) }))

const { POST } = await import('../import/route')

const TENANT = 'tenant-1'

let insertedProperties: Record<string, unknown>[]
let existingSupplierNames: string[]

// The agency's own words: 'nile_cruise_line' is this tenant's name for a
// cruise company. Behaviour, not key, decides what it can own.
const VOCAB = [
  { key: 'hotel', label: 'Hotel', behavior: 'hotel' },
  { key: 'cruise', label: 'Cruise Company', behavior: 'cruise' },
  { key: 'nile_cruise_line', label: 'Nile Cruise Line', behavior: 'cruise' },
  { key: 'train_operator', label: 'Train Operator', behavior: 'train_operator' },
  { key: 'restaurant', label: 'Restaurant', behavior: 'restaurant' },
]

function stubDb() {
  return {
    from: (table: string) => {
      if (table === 'supplier_properties') {
        return {
          insert: async (rows: Record<string, unknown>[]) => {
            insertedProperties.push(...rows)
            return { error: null }
          },
        }
      }
      return {
        select: () => ({ eq: async () => ({ data: existingSupplierNames.map(name => ({ name })) }) }),
        insert: (rows: { name: string }[]) => ({
          select: async () => ({
            data: rows.map((r, i) => ({ id: `supplier-${i}`, name: r.name })),
            error: null,
          }),
        }),
      }
    },
  }
}

async function importCsv(rows: string[]) {
  const csvData = ['Name,Type,Properties', ...rows].join('\n')
  const req = { json: async () => ({ csvData }) }
  return (await POST(req as never)).json()
}

const placed = () => insertedProperties.map(p => `${p.property_type}:${p.name}`)

beforeEach(() => {
  vi.clearAllMocks()
  insertedProperties = []
  existingSupplierNames = []
  mockAuth.mockResolvedValue({ error: null, supabase: stubDb(), tenant_id: TENANT })
  mockVocab.mockResolvedValue(VOCAB)
})

describe('the Properties column creates the supplier\'s assets', () => {
  it('places a type-qualified property under the new supplier', async () => {
    const res = await importCsv(['Sunboat Cruises,cruise,ship:MS Hapi'])
    expect(res.inserted).toBe(1)
    expect(res.propertiesCreated).toBe(1)
    expect(placed()).toEqual(['ship:MS Hapi'])
    expect(insertedProperties[0]).toMatchObject({ tenant_id: TENANT, supplier_id: 'supplier-0' })
  })

  it('infers the kind when the supplier\'s roles allow exactly one', async () => {
    const res = await importCsv(['Nile Star Group,hotel,Nile Star Cairo | Nile Star Luxor'])
    expect(res.propertiesCreated).toBe(2)
    expect(placed()).toEqual(['hotel:Nile Star Cairo', 'hotel:Nile Star Luxor'])
  })

  it('reads the kind from the agency\'s own supplier type, not its spelling', async () => {
    // 'nile_cruise_line' is the tenant's word; its BEHAVIOUR is cruise.
    const res = await importCsv(['Osiris Line,nile_cruise_line,MS Nefertari'])
    expect(res.propertiesCreated).toBe(1)
    expect(placed()).toEqual(['ship:MS Nefertari'])
  })

  it('creates one row when a file names the same property twice', async () => {
    // (supplier, type, name) is the table's unique key — a duplicate in the
    // sheet must not bounce the whole insert.
    const res = await importCsv(['Sunboat Cruises,cruise,ship:MS Hapi | ship:MS HAPI'])
    expect(res.propertiesCreated).toBe(1)
    expect(placed()).toEqual(['ship:MS Hapi'])
  })
})

describe('it refuses to guess, and says why', () => {
  it('will not choose between two kinds the supplier could own', async () => {
    const res = await importCsv(['Nile Fleet,hotel|cruise,Nefertari'])
    expect(res.inserted).toBe(1) // the supplier still lands
    expect(res.propertiesCreated).toBe(0)
    expect(res.propertyWarnings).toHaveLength(1)
    expect(res.propertyWarnings[0].reason).toMatch(/say which kind "Nefertari" is/)
    expect(res.propertyWarnings[0].reason).toMatch(/hotel or ship/)
  })

  it('refuses a kind the supplier\'s roles do not own', async () => {
    const res = await importCsv(['Nile Star Group,hotel,ship:MS Hapi'])
    expect(res.propertiesCreated).toBe(0)
    expect(res.propertyWarnings[0].reason).toMatch(/does not own a ship/)
  })

  it('names a prefix that is not a kind of property at all', async () => {
    const res = await importCsv(['Sunboat Cruises,cruise,boat:MS Hapi'])
    expect(res.propertiesCreated).toBe(0)
    expect(res.propertyWarnings[0].reason).toMatch(/"boat" is not a kind of property/)
    expect(res.propertyWarnings[0].reason).toMatch(/ship, hotel, train/)
  })

  it('says so when the supplier\'s roles own no properties', async () => {
    const res = await importCsv(['Koshary Abou Tarek,restaurant,Downtown Branch'])
    expect(res.inserted).toBe(1)
    expect(res.propertiesCreated).toBe(0)
    expect(res.propertyWarnings[0].reason).toMatch(/its roles own no properties/)
  })

  it('a bad property never costs the supplier its row', async () => {
    const res = await importCsv([
      'Sunboat Cruises,cruise,boat:MS Hapi',
      'Nile Star Group,hotel,hotel:Nile Star Cairo',
    ])
    expect(res.inserted).toBe(2)
    expect(res.propertiesCreated).toBe(1)
    expect(placed()).toEqual(['hotel:Nile Star Cairo'])
  })
})

describe('an import creates, it never reaches into a supplier already on file', () => {
  it('skips properties named against an existing supplier, and counts them', async () => {
    existingSupplierNames = ['Sunboat Cruises']
    const res = await importCsv(['Sunboat Cruises,cruise,ship:MS Hapi | ship:MS Isis'])
    expect(res.inserted).toBe(0)
    expect(res.skippedExisting).toEqual(['Sunboat Cruises'])
    expect(res.propertiesCreated).toBe(0)
    // Counted, not silent — the operator can see what did not happen.
    expect(res.propertiesSkippedExisting).toBe(2)
  })
})

describe('a row with no Properties cell is untouched', () => {
  it('writes no properties and raises nothing', async () => {
    const res = await importCsv(['Sunboat Cruises,cruise,'])
    expect(res.inserted).toBe(1)
    expect(res.propertiesCreated).toBe(0)
    expect(res.propertyWarnings).toEqual([])
    expect(insertedProperties).toEqual([])
  })
})
