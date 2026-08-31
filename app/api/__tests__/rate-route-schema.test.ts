// Guard the two schema mismatches that shipped broken:
//
//   * the transportation route embedded team_members' sibling `suppliers` and
//     filtered supplier_id, but transportation_rates is the one rate table
//     with no supplier_id — so the whole GET 400'd and the list was empty.
//   * the cruise route filtered `route`, but the column is `route_name`, so
//     any request carrying that filter 400'd on a nonexistent column.
//
// CI has no database, so this asserts what source can: the fixed routes must
// not reference the phantom column/relationship again.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('rate routes match the schema', () => {
  it('the transportation routes embed no suppliers relationship', () => {
    for (const p of ['rates/transportation/route.ts', 'rates/transportation/[id]/route.ts']) {
      const code = read(p).split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')
      expect(code, p).not.toMatch(/supplier:\s*suppliers/)
      expect(code, p).not.toMatch(/\.eq\('supplier_id'/)
    }
  })

  it('the cruise route filters route_name, not route', () => {
    const code = read('rates/cruises/route.ts').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    expect(code).not.toMatch(/\.eq\('route',/)
    expect(code).toMatch(/\.eq\('route_name',/)
  })

  it('the invoice pause route uses the authenticated server client', () => {
    const code = read('invoices/[id]/pause/route.ts')
    expect(code).toContain('createAuthenticatedClient')
    expect(code).not.toContain("from '@/app/supabase'")
  })
})
