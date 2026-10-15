import { describe, it, expect } from 'vitest'
import { orIlikeContains } from '@/lib/postgrest-search'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

describe('orIlikeContains', () => {
  it('quotes the term, so commas and brackets are text', () => {
    expect(orIlikeContains('Smith, John (Cairo)')).toBe('"%Smith, John (Cairo)%"')
  })
  it('escapes quotes and backslashes inside the quotes', () => {
    expect(orIlikeContains('a"b')).toBe('"%a\\"b%"')
  })
  it('matches LIKE wildcards literally', () => {
    expect(orIlikeContains('50%_off')).toBe('"%50\\\\%\\\\_off%"')
  })
})

describe('the inbox conversation search', () => {
  const route = readFileSync(path.join(__dirname, '..', '..', 'app/api/email/conversations/route.ts'), 'utf8')
  it('no longer puts the raw search into the filter', () => {
    expect(route).not.toContain('ilike.%${search}%')
    expect(route).toContain('orIlikeContains(search)')
  })
})

describe('every search built into an .or() filter', () => {
  const root = path.join(__dirname, '..', '..')
  const sources = (dir: string): string[] =>
    readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
      const rel = path.join(dir, e.name)
      if (e.isDirectory()) return e.name === 'node_modules' || e.name === '__tests__' ? [] : sources(rel)
      return /\.tsx?$/.test(e.name) ? [rel] : []
    })
  it('goes through orIlikeContains, never raw `ilike.%${...}%`', () => {
    const raw = ['app', 'lib']
      .flatMap(sources)
      .filter(f => f !== path.join('lib', 'postgrest-search.ts'))
      .filter(f => readFileSync(path.join(root, f), 'utf8').includes('ilike.%${'))
    expect(raw).toEqual([])
  })
})
