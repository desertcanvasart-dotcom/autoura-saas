import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// Creating content, categories or rules never set (or set the wrong)
// company (2026-10-11). The Quote Builder's day writer reads them scoped to
// the company: app/api/pricing-grid/__tests__/write-days.test.ts.
// ============================================

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')


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
