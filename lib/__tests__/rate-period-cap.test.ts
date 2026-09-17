import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ratePeriodCapError, countProposedSeasons, sanitizeSeasons, MAX_RATE_PERIODS } from '@/lib/rates/rate-seasons'

// ============================================
// Six periods per rate, at every write
// ============================================
// The editor stops at six and the CSV reports a seventh as an error, but the
// four save routes did not check at all: anything posting straight to the API
// stored a seventh period the editor could never show and nobody could
// correct. Reads stay tolerant — a row that somehow holds more must still
// price, not fall back to the legacy columns.

const period = (from: string, to: string, ppd = 100) => ({
  name: `${from}`, from, to, rates: { ppd_eur: ppd },
})
const many = (n: number) =>
  Array.from({ length: n }, (_, i) => period(`2027-0${(i % 9) + 1}-01`, `2027-0${(i % 9) + 1}-28`))

describe('countProposedSeasons', () => {
  it('counts fully dated periods', () => {
    expect(countProposedSeasons(many(3))).toBe(3)
  })

  it('ignores half-filled editor rows, which the sanitizer drops anyway', () => {
    const rows = [...many(6), { name: 'new row', from: '', to: '', rates: {} }]
    expect(countProposedSeasons(rows)).toBe(6)
    expect(ratePeriodCapError(rows)).toBeNull()
  })

  it('is 0 for anything that is not a list', () => {
    for (const x of [null, undefined, 'x', {}, 7]) expect(countProposedSeasons(x)).toBe(0)
  })
})

describe('ratePeriodCapError', () => {
  it('passes six', () => {
    expect(ratePeriodCapError(many(MAX_RATE_PERIODS))).toBeNull()
  })

  it('refuses seven, and says how many to remove', () => {
    const err = ratePeriodCapError(many(7))
    expect(err).toContain('at most 6')
    expect(err).toContain('has 7')
    expect(err).toContain('Remove 1')
  })

  it('counts the whole payload, not one row — the rate is refused, not trimmed', () => {
    expect(ratePeriodCapError(many(9))).toContain('Remove 3')
  })
})

describe('reading is still tolerant', () => {
  it('a stored row with more than six periods still prices', () => {
    const parsed = sanitizeSeasons(many(8), 'accommodation')
    expect(parsed).toHaveLength(8)
    expect(parsed?.[0].rates.ppd_eur).toBe(100)
  })
})

describe('every save route checks the cap', () => {
  const ROUTES = [
    'app/api/rates/hotels/route.ts',
    'app/api/rates/hotels/[id]/route.ts',
    'app/api/rates/cruises/route.ts',
    'app/api/rates/cruises/[id]/route.ts',
  ]

  for (const rel of ROUTES) {
    it(rel, () => {
      const src = readFileSync(path.join(__dirname, '..', '..', rel), 'utf8')
      expect(src).toContain('ratePeriodCapError(body.seasons)')
      // Before the payload is sanitised, so the refusal names the real count.
      expect(src.indexOf('ratePeriodCapError(body.seasons)')).toBeLessThan(
        src.indexOf('sanitizeSeasons(body.seasons')
      )
      expect(src).toMatch(/status: 400/)
    })
  }
})
