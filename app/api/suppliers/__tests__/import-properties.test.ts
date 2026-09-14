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
/** Suppliers already in the tenant, with the roles they actually have. */
let existingSuppliers: Array<{ id: string; name: string; type: string; types: string[] }>
/** Properties those suppliers already own. */
let existingProperties: Array<{ id: string; supplier_id: string; property_type: string; name: string }>

// The agency's own words: 'nile_cruise_line' is this tenant's name for a
// cruise company. Behaviour, not key, decides what it can own.
const VOCAB = [
  { key: 'hotel', label: 'Hotel', behavior: 'hotel' },
  { key: 'cruise', label: 'Cruise Company', behavior: 'cruise' },
  { key: 'nile_cruise_line', label: 'Nile Cruise Line', behavior: 'cruise' },
  { key: 'train_operator', label: 'Train Operator', behavior: 'train_operator' },
  { key: 'restaurant', label: 'Restaurant', behavior: 'restaurant' },
]

/** A thenable that answers every filter in the chain with the same rows. */
function rows<T>(data: T[]) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: { data: T[]; error: null }) => unknown) => resolve({ data, error: null }),
  }
  for (const method of ['eq', 'in', 'order', 'select']) chain[method] = () => chain
  return chain
}

function stubDb() {
  return {
    from: (table: string) => {
      if (table === 'supplier_properties') {
        return {
          select: () => rows(existingProperties),
          insert: async (inserted: Record<string, unknown>[]) => {
            insertedProperties.push(...inserted)
            return { error: null }
          },
        }
      }
      return {
        select: () => rows(existingSuppliers),
        insert: (inserting: { name: string; type: string; types: string[] }[]) => ({
          select: async () => ({
            data: inserting.map((r, i) => ({ id: `supplier-${i}`, name: r.name, type: r.type, types: r.types })),
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
  existingSuppliers = []
  existingProperties = []
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
    expect(res.propertyWarnings[0].reason).toMatch(/ship, hotel or train/)
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

describe('a re-import TOPS UP a supplier already on file', () => {
  beforeEach(() => {
    existingSuppliers = [{ id: 'existing-1', name: 'Sunboat Cruises', type: 'cruise', types: ['cruise'] }]
  })

  it('adds the ships it does not have yet, without touching the supplier row', async () => {
    const res = await importCsv(['Sunboat Cruises,cruise,ship:MS Hapi | ship:MS Isis'])
    expect(res.inserted).toBe(0) // the supplier itself is never re-created
    expect(res.skippedExisting).toEqual(['Sunboat Cruises'])
    expect(res.propertiesCreated).toBe(2)
    expect(placed()).toEqual(['ship:MS Hapi', 'ship:MS Isis'])
    expect(insertedProperties[0]).toMatchObject({ supplier_id: 'existing-1' })
  })

  it('leaves a property it already owns exactly as it is', async () => {
    existingProperties = [
      { id: 'prop-1', supplier_id: 'existing-1', property_type: 'ship', name: 'MS Hapi' },
    ]
    const res = await importCsv(['Sunboat Cruises,cruise,ship:MS Hapi | ship:MS Isis'])
    expect(res.propertiesCreated).toBe(1)
    expect(placed()).toEqual(['ship:MS Isis'])
    expect(res.propertiesAlreadyPresent).toBe(1)
  })

  it('matches what it already owns case-insensitively', async () => {
    // The DB's unique key is case-SENSITIVE, so without this "MS HAPI" would
    // become a second ship alongside "MS Hapi".
    existingProperties = [
      { id: 'prop-1', supplier_id: 'existing-1', property_type: 'ship', name: 'MS Hapi' },
    ]
    const res = await importCsv(['Sunboat Cruises,cruise,ship:MS HAPI'])
    expect(res.propertiesCreated).toBe(0)
    expect(insertedProperties).toEqual([])
  })

  it('validates against the roles the supplier ACTUALLY has, not the file\'s claim', async () => {
    // The sheet says hotel; the supplier on file is a cruise company. Nothing
    // updates the supplier, so a hotel cannot be hung off it.
    const res = await importCsv(['Sunboat Cruises,hotel,hotel:Nile Star'])
    expect(res.propertiesCreated).toBe(0)
    expect(res.propertyWarnings[0].reason).toMatch(/does not own a hotel/)
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
