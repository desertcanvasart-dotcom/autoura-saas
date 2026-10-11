import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// The rates import matches stored rows whatever their case, aims each update
// at one stored row, and reads "Y" and "NULL" as the preview does.
// ============================================================================

const mockAuth = vi.fn()
vi.mock('@/lib/supabase-server', () => ({ requireAuth: () => mockAuth() }))
vi.mock('@/lib/vocabulary-server', () => ({ loadVocabulary: async () => [] }))
vi.mock('@/lib/suppliers/resolve-property', () => ({ resolveRateProperty: async () => ({ property_id: null }) }))

const { POST } = await import('../bulk/import/route')

let inserted: Record<string, unknown>[]
let updated: Array<{ data: Record<string, unknown>; where: Record<string, unknown> }>
let existing: Record<string, unknown>[]

const selectChain = (rows: () => unknown[]) => {
  const chain: Record<string, unknown> = {}
  for (const m of ['eq', 'in', 'not', 'order', 'ilike']) chain[m] = () => chain
  chain.range = async () => ({ data: rows(), error: null })
  chain.then = (ok: (v: unknown) => unknown) => ok({ data: rows(), error: null })
  return chain
}

function stubDb() {
  const table = {
    select: () => selectChain(() => existing),
    insert: async (rows: Record<string, unknown>[]) => { inserted.push(...rows); return { error: null } },
    update: (data: Record<string, unknown>) => {
      const rec = { data, where: {} as Record<string, unknown> }
      updated.push(rec)
      const chain = {
        eq: (c: string, v: unknown) => { rec.where[c] = v; return chain },
        neq: () => chain, is: () => chain, ilike: () => chain,
        then: (ok: (v: unknown) => unknown) => ok({ error: null }),
      }
      return chain
    },
  }
  return { from: () => table }
}

async function importCsv(table: string, csv: string, dryRun = false) {
  const req = { json: async () => ({ table, csvData: csv, dryRun }) }
  return (await POST(req as never)).json()
}

beforeEach(() => {
  inserted = []; updated = []; existing = []
  mockAuth.mockResolvedValue({ error: null, supabase: stubDb(), tenant_id: 'tenant-1', role: 'manager' })
})

const TIP_HEAD = 'service_code,role_type,context,city,rate_unit,rate_eur,is_active'

describe('the rates import', () => {
  it('updates the stored row whatever the case of its code, aimed at its id', async () => {
    existing = [{ id: 'row-1', service_code: 'TIP-GUIDE-DAY' }]
    const res = await importCsv('tipping_rates', `${TIP_HEAD}\ntip-guide-day,guide,day_tour,Cairo,per_day,12,Y`)
    expect(res.updated).toBe(1)
    expect(inserted).toEqual([])
    expect(updated[0].where).toEqual({ tenant_id: 'tenant-1', id: 'row-1' })
    // "Y" passed the preview as yes, so it is stored as yes.
    expect(updated[0].data.is_active).toBe(true)
  })

  it('refuses a row whose code two stored rates share, rather than overwrite both', async () => {
    existing = [{ id: 'a', service_code: 'TIP-GUIDE-DAY' }, { id: 'b', service_code: 'TIP-GUIDE-DAY' }]
    const res = await importCsv('tipping_rates', `${TIP_HEAD}\nTIP-GUIDE-DAY,guide,day_tour,Cairo,per_day,12,true`)
    expect(updated).toEqual([])
    expect(res.errors[0].message).toMatch(/2 of your rates share this service_code/)
  })

  it('reads NULL in any case as blank, never as a value over the stored one', async () => {
    existing = [{ id: 'row-1', service_code: 'TIP-1' }]
    await importCsv('tipping_rates', `${TIP_HEAD}\nTIP-1,guide,NULL,Cairo,per_day,12,true`)
    expect(updated[0].data).not.toHaveProperty('context')
  })

  it('says so when every row is still the example', async () => {
    const res = await importCsv('tipping_rates', `${TIP_HEAD}\nEXAMPLE-DELETE-THIS-ROW,guide,day_tour,Cairo,per_day,12,true`)
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Every row is still the sample's example row/)
  })

  it('carries an activity\'s group-size bands', async () => {
    const res = await importCsv('activity_rates', 'service_code,activity_name,base_rate_eur,pricing_type,tiers\nACT-1,Felucca,25,tiered,1-4:25; 5-8:40')
    expect(res.inserted).toBe(1)
    expect(inserted[0].tiers).toEqual([
      { min_pax: 1, max_pax: 4, rate_eur: 25, rate_non_eur: null, label: null },
      { min_pax: 5, max_pax: 8, rate_eur: 40, rate_non_eur: null, label: null },
    ])
  })

  it('refuses bands it cannot read, naming the cell', async () => {
    const res = await importCsv('activity_rates', 'service_code,activity_name,base_rate_eur,pricing_type,tiers\nACT-1,Felucca,25,tiered,1-4 25', true)
    expect(res.invalidRows).toBe(1)
    expect(res.errors[0].message).toMatch(/Tiers "1-4 25"/)
  })
})
