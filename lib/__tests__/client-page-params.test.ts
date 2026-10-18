import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

// A client page receives `params` as a Promise (Next 15+). Typing it as a
// plain object and reading params.id gave undefined: the B2C and B2B quote
// pages asked for quote "undefined" and showed "Quote Not Found — invalid
// input syntax for type uuid". Every client page unwraps it with use().

const ROOT = join(__dirname, '..', '..')
function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) pages(full, out)
    else if (name === 'page.tsx') out.push(full)
  }
  return out
}

describe('client pages read params as a Promise', () => {
  it('no client page types params as a plain object', () => {
    const bad = pages(join(ROOT, 'app'))
      .filter(f => readFileSync(f, 'utf8').includes("'use client'"))
      .filter(f => /params\s*\}\s*:\s*\{\s*params:\s*\{/.test(readFileSync(f, 'utf8')))
      .map(f => relative(ROOT, f))
    expect(bad).toEqual([])
  })

  it('the quote pages unwrap it', () => {
    for (const f of ['app/quotes/b2c/[id]/page.tsx', 'app/quotes/b2b/[id]/page.tsx', 'app/quotes/b2c/[id]/edit/page.tsx', 'app/quotes/b2b/[id]/edit/page.tsx']) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).toContain('const params = use(paramsPromise)')
    }
  })
})
