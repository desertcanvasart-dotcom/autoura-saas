// Every rate table's insert policy is `tenant_id = get_user_tenant_id()`
// (migration 259; global NULL-tenant rows retired in 331). A POST route that
// inserts without stamping tenant_id therefore fails RLS on every call — which
// is exactly what /api/rates/attractions did: "error every time" on a manual
// add, while all sixteen sibling routes stamped the column. CI has no
// database, so this asserts what source can: each rate POST that inserts a
// row must mention tenant_id somewhere in its insert path.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const ratesDir = join(__dirname, '..', 'rates')
const codeOnly = (src: string) =>
  src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

const postRoutes = readdirSync(ratesDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => join('rates', d.name, 'route.ts'))
  .filter(p => existsSync(join(__dirname, '..', p)))
  .filter(p => {
    const code = codeOnly(readFileSync(join(__dirname, '..', p), 'utf8'))
    return /export async function POST/.test(code) && /\.insert\(/.test(code)
  })

describe('rate POST routes stamp tenant_id on insert', () => {
  it('finds the rate routes that insert rows', () => {
    expect(postRoutes.length).toBeGreaterThan(10)
    expect(postRoutes).toContain('rates/attractions/route.ts')
  })

  it.each(postRoutes)('%s writes tenant_id', p => {
    const code = codeOnly(readFileSync(join(__dirname, '..', p), 'utf8'))
    const postBody = code.slice(code.indexOf('export async function POST'))
    expect(postBody, `${p} inserts without tenant_id — RLS rejects the row`).toMatch(/\btenant_id\b/)
  })
})
