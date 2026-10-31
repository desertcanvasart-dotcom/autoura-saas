import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { clampedIntParam, MAX_LIST_LIMIT } from '@/lib/http/list-params'

describe('clampedIntParam', () => {
  const limit = (raw: string | null) => clampedIntParam(raw, { fallback: 50, max: MAX_LIST_LIMIT })

  it('takes a sensible value as given', () => {
    expect(limit('25')).toBe(25)
  })
  it('caps a huge value at the maximum', () => {
    expect(limit('100000')).toBe(MAX_LIST_LIMIT)
  })
  it('falls back on missing, unreadable, zero or negative values (never NaN)', () => {
    expect(limit(null)).toBe(50)
    expect(limit('abc')).toBe(50)
    expect(limit('0')).toBe(50)
    expect(limit('-5')).toBe(50)
  })
  it('a page number has no practical ceiling but is never below 1', () => {
    const page = (raw: string | null) => clampedIntParam(raw, { fallback: 1, max: Number.MAX_SAFE_INTEGER })
    expect(page('3')).toBe(3)
    expect(page('x')).toBe(1)
    expect(page('-2')).toBe(1)
  })
})

describe('the list routes clamp their limit', () => {
  for (const rel of ['app/api/conversations/route.ts', 'app/api/whatsapp/messages/route.ts']) {
    it(rel, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8')
      expect(src).toContain("clampedIntParam(searchParams.get('limit')")
      expect(src).not.toMatch(/parseInt\(searchParams\.get\('limit'\)/)
    })
  }
})
