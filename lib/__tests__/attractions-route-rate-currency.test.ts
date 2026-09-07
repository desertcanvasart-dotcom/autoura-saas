// The attractions routes are the only rate routes that hand-build their
// response shape instead of returning the selected row. PR #235 added the
// WRITE side of per-rate currency to them but not the read shape, so an
// imported EGP entrance fee rendered as EUR and the edit form reopened on
// "EUR (default)" — every save of the currency then looked like it had been
// ignored. This pins rate_currency into both read shapes.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
const LIST = readFileSync(join(ROOT, 'app', 'api', 'rates', 'attractions', 'route.ts'), 'utf8')
const ONE = readFileSync(join(ROOT, 'app', 'api', 'rates', 'attractions', '[id]', 'route.ts'), 'utf8')

function transformBlock(src: string, opener: RegExp): string {
  const start = src.search(opener)
  expect(start).toBeGreaterThan(-1)
  const end = src.indexOf('updated_at:', start)
  expect(end).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('attractions routes return the stored rate currency', () => {
  it('the list transform carries rate_currency through', () => {
    const block = transformBlock(LIST, /const transformedData = data\?\.map/)
    expect(block).toMatch(/rate_currency:\s*item\.rate_currency/)
  })
  it('the single-row transform carries rate_currency through', () => {
    const block = transformBlock(ONE, /const transformed = \{/)
    expect(block).toMatch(/rate_currency:\s*data\.rate_currency/)
  })
})
