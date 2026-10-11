import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fetchWritingRules, fetchContentLibrary } from '@/lib/ai/content-library'

// ============================================
// The AI writes from THIS company's content and rules (2026-10-11).
// generate-itinerary reads the Content Library and Writing Rules with the
// service-role client, which bypasses RLS, and the reads had no tenant
// filter: another company's descriptions and house style went into this
// company's itineraries. And creating content, categories or rules never
// set (or set the wrong) company.
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

/** A query builder that records its filters. */
function recorder(rows: unknown[] = []) {
  const filters: Array<[string, unknown]> = []
  const q: Record<string, unknown> = {}
  const self = () => q
  Object.assign(q, {
    from: self, select: self, order: self, in: self, limit: self,
    eq: (col: string, v: unknown) => { filters.push([col, v]); return q },
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
  })
  return { db: q, filters }
}

describe('the AI’s content and rules', () => {
  it('writing rules are this company’s', async () => {
    const { db, filters } = recorder()
    await fetchWritingRules(db, 't1')
    expect(filters).toContainEqual(['tenant_id', 't1'])
  })

  it('content variations are of this company’s content', async () => {
    const { db, filters } = recorder()
    await fetchContentLibrary(db, 't1', 'standard', ['cairo'], [])
    expect(filters).toContainEqual(['content_library.tenant_id', 't1'])
  })

  it('the route passes the company to every read, the cruise one included', () => {
    const route = src('app/api/ai/generate-itinerary/route.ts')
    expect(route).toContain('findCruiseContent(getSupabaseAdmin(), tenant_id,')
    expect(route).toContain('fetchContentLibrary(getSupabaseAdmin(), tenant_id,')
    expect(route).toContain('fetchWritingRules(getSupabaseAdmin(), tenant_id)')
    expect(src('lib/ai/content-library.ts')).toContain(".eq('tenant_id', tenantId)\n      .eq('is_cruise', true)")
  })
})

describe('creating library content', () => {
  it('content, categories and rules are saved under the company you are signed into', () => {
    for (const f of ['app/api/content-library/route.ts', 'app/api/content-library/categories/route.ts', 'app/api/content-library/writing-rules/route.ts']) {
      const s = src(f)
      const post = s.slice(s.indexOf('export async function POST'))
      expect(post, f).toContain('const auth = await requireAuth()')
      expect(post, f).toMatch(/\.insert\(\{\s+tenant_id,/)
    }
    expect(src('app/api/content-library/writing-rules/route.ts')).not.toContain("from('user_profiles')")
  })
})
