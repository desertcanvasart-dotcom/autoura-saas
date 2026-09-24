import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Hotels and cruises import ONE sheet: a row per dated period
// ============================================================================
// Operator, 2026-09-24: one file with everything. The real import route,
// against a stub database: rows group back into one hotel each, the hotel
// gets exactly the periods the file lists (a new hotel is created WITH them,
// an existing one has its periods replaced), a hotel the file lists with no
// period keeps what it has, and messages name the file's own line.

const mockAuth = vi.fn()
const SEASONS = [
  { key: 'low_season', label: 'Low Season', is_active: true },
  { key: 'christmas', label: 'Christmas', is_active: true },
]
vi.mock('@/lib/supabase-server', () => ({ requireAuth: () => mockAuth() }))
vi.mock('@/lib/vocabulary-server', () => ({
  loadVocabulary: async (_db: unknown, kind: string) => (kind === 'rate_season' ? SEASONS : []),
}))
vi.mock('@/lib/suppliers/resolve-property', () => ({ resolveRateProperty: async () => ({ property_id: null }) }))

const { POST } = await import('../bulk/import/route')

let inserted: Record<string, unknown>[]
let updated: Array<{ data: Record<string, unknown>; where: Record<string, unknown> }>
let existing: Record<string, unknown>[]

function stubDb() {
  const rateTable = {
    select: () => ({ in: () => ({ eq: async () => ({ data: existing }) }) }),
    insert: async (rows: Record<string, unknown>[]) => { inserted.push(...rows); return { error: null } },
    update: (data: Record<string, unknown>) => {
      const rec = { data, where: {} as Record<string, unknown> }
      updated.push(rec)
      const chain = {
        eq: (c: string, v: unknown) => { rec.where[c] = v; return chain },
        then: (ok: (v: unknown) => unknown) => ok({ error: null }),
      }
      return chain
    },
  }
  return { from: () => rateTable }
}

const HEAD = 'service_code,property_name,city,period_name,period_season,period_from,period_to,period_pp_double_eur,period_single_supp_eur,period_triple_red_eur,period_pp_double_non_eur,period_single_supp_non_eur,period_triple_red_non_eur,period_guide_rate_eur'
const line = (code: string, name: string, period: string, season: string, from: string, to: string, ppd: number) =>
  `${code},${name},Aswan,${period},${season},${from},${to},${ppd},${ppd - 20},2,${ppd - 10},${ppd - 25},2,60`

async function importCsv(csv: string, dryRun = false) {
  const req = { json: async () => ({ table: 'accommodation_rates', csvData: csv, dryRun }) }
  return (await POST(req as never)).json()
}

beforeEach(() => {
  inserted = []; updated = []; existing = []
  mockAuth.mockResolvedValue({ error: null, supabase: stubDb(), tenant_id: 'tenant-1' })
})

describe('importing the one hotel sheet', () => {
  it('a NEW hotel is created once, with every period the file lists', async () => {
    const res = await importCsv([HEAD,
      line('ACC-NEW', 'Nile View', 'Summer', 'Low Season', '2026-05-01', '2026-09-30', 96),
      line('ACC-NEW', 'Nile View', 'Xmas', 'Christmas', '2026-12-21', '2026-12-26', 130),
    ].join('\n'))
    expect(res.inserted).toBe(1)
    expect(inserted).toHaveLength(1)
    const seasons = inserted[0].seasons as Array<{ name: string; season?: string; rates: Record<string, number> }>
    expect(seasons.map(s => s.name)).toEqual(['Summer', 'Xmas'])
    expect(seasons[1].season).toBe('christmas') // the agency's word → its key
    expect(seasons[0].rates.guide_rate_eur).toBe(60)
    // Period 1 mirrored onto the price columns, both families.
    expect(inserted[0]).toMatchObject({ ppd_eur: 96, pp_double_eur: 96, low_season_from: '2026-05-01', city: 'Aswan' })
    // No period column leaks into the row.
    expect(Object.keys(inserted[0]).some(k => k.startsWith('period_'))).toBe(false)
  })

  it('an EXISTING hotel gets exactly the file\'s periods — a period removed from the file is removed', async () => {
    existing = [{ service_code: 'ACC-ASW', seasons: [1, 2, 3, 4, 5].map(n => ({ name: `P${n}`, from: `2026-0${n}-01`, to: `2026-0${n}-20`, rates: { ppd_eur: 50 } })) }]
    const res = await importCsv([HEAD,
      line('ACC-ASW', 'Basma Aswan', 'Summer', 'Low Season', '2026-05-01', '2026-09-30', 96),
      line('ACC-ASW', 'Basma Aswan', 'Xmas', 'Christmas', '2026-12-21', '2026-12-26', 130),
    ].join('\n'))
    expect(res.updated).toBe(1)
    expect((updated[0].data.seasons as unknown[]).length).toBe(2)
    expect(res.periodsKept).toBe(0)
  })

  it('an existing hotel the file lists with NO period keeps the periods it has', async () => {
    existing = [{ service_code: 'ACC-ASW', seasons: [{ name: 'P1', from: '2026-01-01', to: '2026-01-20', rates: { ppd_eur: 50 } }] }]
    const res = await importCsv([HEAD, 'ACC-ASW,Basma Aswan,Aswan,,,,,,,,,,,'].join('\n'))
    expect(res.updated).toBe(1)
    expect(updated[0].data).not.toHaveProperty('seasons')
    expect(res.periodsKept).toBe(1)
  })

  it('refuses the file when a hotel\'s rows disagree, naming the FILE line', async () => {
    const res = await importCsv([HEAD,
      line('ACC-NEW', 'Nile View', 'Summer', 'Low Season', '2026-05-01', '2026-09-30', 96),
      line('ACC-NEW', 'Nile View', 'Xmas', 'Christmas', '2026-12-21', '2026-12-26', 130).replace(',Aswan,', ',Luxor,'),
    ].join('\n'))
    expect(res.success).toBe(false)
    expect(res.errors[0]).toMatchObject({ row: 3, column: 'city' })
    expect(inserted).toHaveLength(0)
  })

  it('refuses a season word the agency does not use', async () => {
    const res = await importCsv([HEAD, line('ACC-NEW', 'Nile View', 'Summer', 'Ramadan', '2026-05-01', '2026-09-30', 96)].join('\n'))
    expect(res.success).toBe(false)
    expect(res.errors[0].message).toContain('Season "Ramadan"')
  })

  it('the dry run counts properties, not lines', async () => {
    const res = await importCsv([HEAD,
      line('ACC-A', 'A', 'P1', '', '2026-05-01', '2026-09-30', 96),
      line('ACC-A', 'A', 'P2', '', '2026-10-01', '2026-12-30', 99),
      line('ACC-B', 'B', 'P1', '', '2026-05-01', '2026-09-30', 70),
    ].join('\n'), true)
    expect(res).toMatchObject({ success: true, dryRun: true, totalRows: 2, validRows: 2 })
  })
})
