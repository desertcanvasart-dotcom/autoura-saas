// One preferred row per scope (migrations 353/354): the helper that clears a
// row's siblings before it is flagged, the scopes it uses, and the guards
// that keep the toggle route and the rate forms on that single path.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { clearPreferredSiblings, describeScope, isPreferredTable, PREFERRED_SCOPES } from '@/lib/rates/preferred'

const ROOT = join(__dirname, '..', '..')
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8')

/** Records the update-builder chain the helper issues. */
function recordingClient() {
  const calls: Array<[string, unknown[]]> = []
  const builder: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (resolve: (r: unknown) => unknown) => resolve({ error: null })
      return (...args: unknown[]) => { calls.push([prop, args]); return builder }
    },
  })
  return { client: { from: (table: string) => { calls.push(['from', [table]]); return { update: (v: unknown) => { calls.push(['update', [v]]); return builder } } } }, calls }
}

describe('clearPreferredSiblings', () => {
  it('clears the flag on every other row in the same tenant, city and tier — case-insensitively', async () => {
    const { client, calls } = recordingClient()
    const r = await clearPreferredSiblings(client, 'accommodation_rates', 't1', { city: 'Cairo', tier: 'standard' }, 'h2')
    expect(r.error).toBeNull()
    expect(calls).toEqual([
      ['from', ['accommodation_rates']],
      ['update', [{ is_preferred: false }]],
      ['eq', ['tenant_id', 't1']],
      ['eq', ['is_preferred', true]],
      ['neq', ['id', 'h2']],
      ['ilike', ['city', 'Cairo']],
      ['ilike', ['tier', 'standard']],
    ])
  })
  it('a blank scope column matches the other blank rows (IS NULL), and wildcards are escaped', async () => {
    const { client, calls } = recordingClient()
    await clearPreferredSiblings(client, 'meal_rates', 't1', { tier: '', meal_type: '50%_lunch' }, 'm1')
    expect(calls.slice(-2)).toEqual([['is', ['tier', null]], ['ilike', ['meal_type', '50\\%\\_lunch']]])
  })
  it('scopes mirror the engine pools and the migration-354 indexes', () => {
    expect(PREFERRED_SCOPES.accommodation_rates.columns).toEqual(['city', 'tier'])
    expect(PREFERRED_SCOPES.nile_cruises.columns).toEqual(['tier'])
    expect(PREFERRED_SCOPES.meal_rates.columns).toEqual(['tier', 'meal_type'])
    expect(isPreferredTable('accommodation_rates')).toBe(true)
    expect(isPreferredTable('entrance_fees')).toBe(false)
    expect(describeScope('accommodation_rates', { city: 'Cairo', tier: 'standard' })).toBe('Cairo · standard')
    expect(describeScope('meal_rates', { tier: 'luxury', meal_type: null })).toBe('luxury')
  })
})

describe('write paths that can set is_preferred clear the siblings first', () => {
  it('the toggle route', () => {
    const src = read('app', 'api', 'rates', 'preferred', 'route.ts')
    expect(src).toMatch(/if \(preferred\) \{[\s\S]{0,200}clearPreferredSiblings\(/)
    expect(src).toMatch(/isPreferredTable\(table\)/)
  })
  it('the cruise and meal forms (PUT) and the meal create (POST)', () => {
    expect(read('app', 'api', 'rates', 'cruises', '[id]', 'route.ts')).toMatch(/updateData\.is_preferred[\s\S]{0,300}clearPreferredSiblings\([\s\S]{0,600}\.update\(updateData\)/)
    expect(read('app', 'api', 'rates', 'meals', '[id]', 'route.ts')).toMatch(/is_preferred === true[\s\S]{0,500}clearPreferredSiblings\([\s\S]{0,400}\.update\(updateData\)/)
    expect(read('app', 'api', 'rates', 'meals', 'route.ts')).toMatch(/newRate\.is_preferred[\s\S]{0,300}clearPreferredSiblings\([\s\S]{0,300}\.insert\(newRate\)/)
  })
  it('migration 354 defines one partial unique index per scoped table', () => {
    const sql = read('supabase', 'migrations', '354_one_preferred_per_scope.sql')
    for (const idx of ['accommodation_rates_one_preferred_idx', 'nile_cruises_one_preferred_idx', 'meal_rates_one_preferred_idx']) {
      expect(sql).toMatch(new RegExp(`CREATE UNIQUE INDEX IF NOT EXISTS ${idx}[\\s\\S]{0,300}WHERE is_preferred`))
    }
  })
  it('every page that lists a scoped table shows the star', () => {
    expect(read('app', 'rates', 'hotels', 'hotels-content.tsx').match(/<PreferredStar table="accommodation_rates"/g)).toHaveLength(3)
    expect(read('app', 'rates', 'cruises', 'page.tsx').match(/<PreferredStar table="nile_cruises"/g)).toHaveLength(1)
    expect(read('app', 'rates', 'meals', 'meal-rates-content.tsx').match(/<PreferredStar table="meal_rates"/g)).toHaveLength(3)
  })
})
