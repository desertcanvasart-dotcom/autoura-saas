// ============================================
// The docs agree with themselves — and with the pages on disk
// ============================================
// The /docs index and the docs sidebar each carried their own copy of the
// table of contents (CATEGORIES in page.tsx, NAV_ITEMS in layout.tsx). They
// drifted — different order and grouping, and the sidebar had dropped the
// Integrations entry the index still showed. Both now render
// app/(public)/docs/toc.ts; this test pins that single list to the page
// directories on disk, in both directions, so adding a doc page without
// listing it (or listing one that does not exist) fails here, not on a user.
//
// One TOC entry is an external app link (/integrations) rather than a /docs
// page, so the on-disk checks look only at hrefs under /docs/.
import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORIES } from '@/app/(public)/docs/toc'

const DOCS_DIR = join(process.cwd(), 'app/(public)/docs')

const tocHrefs = CATEGORIES.flatMap(c => c.items.map(i => i.href))
const tocDocHrefs = tocHrefs.filter(h => h.startsWith('/docs/'))
const pageDirs = readdirSync(DOCS_DIR)
  .filter(e => statSync(join(DOCS_DIR, e)).isDirectory() && e !== '__tests__')
  .map(d => `/docs/${d}`)

describe('docs table of contents', () => {
  it('every doc page on disk is listed', () => {
    expect(pageDirs.filter(d => !tocDocHrefs.includes(d))).toEqual([])
  })

  it('every listed /docs entry has a page on disk', () => {
    expect(tocDocHrefs.filter(h => !pageDirs.includes(h))).toEqual([])
  })

  it('no entry is listed twice', () => {
    expect(tocHrefs.length).toBe(new Set(tocHrefs).size)
  })

  it('the sidebar has no list of its own — both renderers import the TOC', () => {
    // The drift class this file exists for: a second copy appearing in either
    // renderer. Each must import from ./toc and define no CATEGORIES/NAV list.
    for (const file of ['layout.tsx', 'page.tsx']) {
      const src = readFileSync(join(DOCS_DIR, file), 'utf8')
      expect(src).toMatch(/from ['"]\.\/toc['"]/)
      expect(src).not.toMatch(/const\s+(CATEGORIES|NAV_ITEMS)\s*[:=]/)
    }
  })
})
