import { describe, it, expect } from 'vitest'
import { shapeCatalog, citiesForDropdown, type CatalogDestination } from '../destination-catalog'
import { EGYPT_CITIES } from '../constants/egypt-cities'

// The destination catalog's pure logic (P1). What matters most: the Egypt
// fallback — an unmigrated or unreachable catalog must leave every city
// dropdown exactly as it was before this feature existed.

const CATALOG_ROWS = [
  {
    id: 'eg', country_code: 'EG', name: 'Egypt', name_ja: 'エジプト',
    destination_cities: [
      { id: 'c2', name: 'Luxor', sort_order: 2, is_active: true },
      { id: 'c1', name: 'Cairo', sort_order: 1, is_active: true },
      { id: 'c3', name: 'Ghost Town', sort_order: 3, is_active: false },
    ],
  },
  { id: 'jo', country_code: 'JO', name: 'Jordan', name_ja: 'ヨルダン', destination_cities: [] },
]

describe('shapeCatalog', () => {
  it('marks selected destinations and carries brief/glossary', () => {
    const shaped = shapeCatalog(CATALOG_ROWS, [
      { catalog_id: 'eg', is_default: true, generation_brief: 'Nile focus', glossary: { Cairo: 'カイロ' } },
    ])
    const eg = shaped.find(d => d.country_code === 'EG')!
    const jo = shaped.find(d => d.country_code === 'JO')!
    expect(eg.selected).toBe(true)
    expect(eg.is_default).toBe(true)
    expect(eg.generation_brief).toBe('Nile focus')
    expect(eg.glossary).toEqual({ Cairo: 'カイロ' })
    expect(jo.selected).toBe(false)
    expect(jo.is_default).toBe(false)
  })

  it('sorts cities by sort_order and drops inactive ones', () => {
    const eg = shapeCatalog(CATALOG_ROWS, [])[0]
    expect(eg.cities.map(c => c.name)).toEqual(['Cairo', 'Luxor'])
  })

  it('tolerates a missing destination_cities join', () => {
    const shaped = shapeCatalog(
      [{ id: 'x', country_code: 'XX', name: 'X', name_ja: null }],
      []
    )
    expect(shaped[0].cities).toEqual([])
  })
})

describe('citiesForDropdown', () => {
  const shaped = (sel: string[]): CatalogDestination[] =>
    shapeCatalog(CATALOG_ROWS, sel.map(id => ({
      catalog_id: id, is_default: false, generation_brief: null, glossary: null,
    })))

  it('returns the selected destinations\' city names in catalog order', () => {
    expect(citiesForDropdown(shaped(['eg']))).toEqual(['Cairo', 'Luxor'])
  })

  it('falls back to the built-in Egypt list when the catalog is empty (migration not applied)', () => {
    expect(citiesForDropdown([])).toEqual([...EGYPT_CITIES])
  })

  it('falls back when destinations exist but none are selected', () => {
    expect(citiesForDropdown(shaped([]))).toEqual([...EGYPT_CITIES])
  })

  it('falls back when the only selected destination has no cities yet', () => {
    // A tenant that just self-served a new country shell must not end up
    // with EMPTY dropdowns — Egypt vocabulary holds until cities exist.
    expect(citiesForDropdown(shaped(['jo']))).toEqual([...EGYPT_CITIES])
  })
})

describe('glossary line format', () => {
  it('round-trips pairs', async () => {
    const { linesToGlossary, glossaryToLines } = await import('../destination-catalog')
    const obj = linesToGlossary('Cairo = カイロ\n\nPetra = ペトラ')
    expect(obj).toEqual({ Cairo: 'カイロ', Petra: 'ペトラ' })
    expect(glossaryToLines(obj)).toBe('Cairo = カイロ\nPetra = ペトラ')
  })

  it('rejects malformed lines instead of silently dropping them', async () => {
    const { linesToGlossary } = await import('../destination-catalog')
    expect(linesToGlossary('Cairo カイロ')).toBeNull()
    expect(linesToGlossary('= カイロ')).toBeNull()
    expect(linesToGlossary('Cairo =')).toBeNull()
  })

  it('tolerates non-object stored glossary shapes', async () => {
    const { glossaryToLines } = await import('../destination-catalog')
    expect(glossaryToLines(null)).toBe('')
    expect(glossaryToLines('legacy string')).toBe('')
    expect(glossaryToLines([1, 2])).toBe('')
  })
})
