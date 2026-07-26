import { describe, it, expect } from 'vitest'
import {
  buildFxIndex,
  resolveRateOnDate,
  convertOnDate,
  collectRequiredPairs,
  describeConversion,
  roundMoney,
  type FxSnapshotRow,
} from '@/lib/fx-conversion'

// LOCKED POLICY: a conversion with no backing rate returns basis 'none' and a
// null amount. It NEVER passes the raw amount through as if it were
// converted — 1000 EGP reported as €1000 is a ~56x error, and in a P&L it
// lands on the cost side where it corrupts margin.

function snapshot(
  base: string,
  target: string,
  rate: number,
  capturedAt: string,
  source = 'er-api'
): FxSnapshotRow {
  return { base_currency: base, target_currency: target, rate, captured_at: capturedAt, source }
}

/** EUR->EGP drifting upward over three months, as EGP weakened. */
const EGP_HISTORY: FxSnapshotRow[] = [
  snapshot('EUR', 'EGP', 50, '2026-01-15T00:00:00.000Z'),
  snapshot('EUR', 'EGP', 53, '2026-02-15T00:00:00.000Z'),
  snapshot('EUR', 'EGP', 56, '2026-03-15T00:00:00.000Z'),
  snapshot('EUR', 'EGP', 60, '2026-04-15T00:00:00.000Z'),
]

describe('buildFxIndex', () => {
  it('groups by pair and orders newest first', () => {
    const index = buildFxIndex(EGP_HISTORY)
    const bucket = index.get('EUR>EGP')!
    expect(bucket).toHaveLength(4)
    expect(bucket[0].rate).toBe(60)
    expect(bucket[3].rate).toBe(50)
  })

  it('drops rows that cannot be trusted rather than importing them', () => {
    const index = buildFxIndex([
      snapshot('EUR', 'EGP', 0, '2026-01-01T00:00:00.000Z'),
      snapshot('EUR', 'EGP', -5, '2026-01-01T00:00:00.000Z'),
      snapshot('EUR', 'EGP', NaN, '2026-01-01T00:00:00.000Z'),
      snapshot('EUR', 'EGP', 50, 'not-a-date'),
      snapshot('', 'EGP', 50, '2026-01-01T00:00:00.000Z'),
      snapshot('EUR', 'EUR', 1, '2026-01-01T00:00:00.000Z'),
    ])
    expect(index.size).toBe(0)
  })

  it('normalises currency case', () => {
    const index = buildFxIndex([snapshot('eur', 'egp', 56, '2026-03-15T00:00:00.000Z')])
    expect(index.has('EUR>EGP')).toBe(true)
  })

  it('accepts numeric strings, as Postgres DECIMAL arrives over the wire', () => {
    const index = buildFxIndex([
      { base_currency: 'EUR', target_currency: 'EGP', rate: '56.25000000', captured_at: '2026-03-15T00:00:00.000Z' },
    ])
    expect(index.get('EUR>EGP')![0].rate).toBe(56.25)
  })

  it('tolerates null/undefined input', () => {
    expect(buildFxIndex(null).size).toBe(0)
    expect(buildFxIndex(undefined).size).toBe(0)
  })
})

describe('resolveRateOnDate — the rate that was true then, not now', () => {
  const index = buildFxIndex(EGP_HISTORY)

  it('picks the newest rate on or before the requested date', () => {
    const result = resolveRateOnDate(index, 'EUR', 'EGP', '2026-03-20T00:00:00.000Z')
    expect(result!.rate).toBe(56)
  })

  it('does not reach forward in time for a fresher rate', () => {
    // April's 60 exists, but a February payment happened at 53.
    const result = resolveRateOnDate(index, 'EUR', 'EGP', '2026-02-20T00:00:00.000Z')
    expect(result!.rate).toBe(53)
  })

  it('matches a rate captured exactly on the requested instant', () => {
    const result = resolveRateOnDate(index, 'EUR', 'EGP', '2026-03-15T00:00:00.000Z')
    expect(result!.rate).toBe(56)
  })

  it('returns null when the date predates all history', () => {
    expect(resolveRateOnDate(index, 'EUR', 'EGP', '2025-06-01T00:00:00.000Z')).toBeNull()
  })

  it('inverts a stored pair exactly', () => {
    const result = resolveRateOnDate(index, 'EGP', 'EUR', '2026-03-20T00:00:00.000Z')
    expect(result!.rate).toBeCloseTo(1 / 56, 12)
  })

  it('identity for the same currency', () => {
    expect(resolveRateOnDate(index, 'EUR', 'EUR', '2026-03-20T00:00:00.000Z')!.rate).toBe(1)
  })

  it('crosses through a shared pivot when no direct pair exists', () => {
    const crossIndex = buildFxIndex([
      snapshot('EUR', 'USD', 1.2, '2026-03-15T00:00:00.000Z'),
      snapshot('EUR', 'EGP', 60, '2026-03-15T00:00:00.000Z'),
    ])
    // 1 USD = (1/1.2) EUR = 50 EGP
    const result = resolveRateOnDate(crossIndex, 'USD', 'EGP', '2026-03-20T00:00:00.000Z')
    expect(result!.rate).toBeCloseTo(50, 10)
    expect(result!.via).toBe('EUR')
  })

  it('reports a cross rate as being only as current as its staler leg', () => {
    const crossIndex = buildFxIndex([
      snapshot('EUR', 'USD', 1.2, '2026-03-15T00:00:00.000Z'),
      snapshot('EUR', 'EGP', 60, '2026-01-10T00:00:00.000Z'),
    ])
    const result = resolveRateOnDate(crossIndex, 'USD', 'EGP', '2026-04-01T00:00:00.000Z')
    expect(result!.asOf).toBe('2026-01-10T00:00:00.000Z')
  })

  it('will not cross when one leg has no rate old enough', () => {
    const crossIndex = buildFxIndex([
      snapshot('EUR', 'USD', 1.2, '2026-03-15T00:00:00.000Z'),
      snapshot('EUR', 'EGP', 60, '2026-03-15T00:00:00.000Z'),
    ])
    expect(resolveRateOnDate(crossIndex, 'USD', 'EGP', '2026-02-01T00:00:00.000Z')).toBeNull()
  })

  it('uses the newest available rate when no date is supplied', () => {
    expect(resolveRateOnDate(index, 'EUR', 'EGP', null)!.rate).toBe(60)
  })

  it('returns null for an unknown pair', () => {
    expect(resolveRateOnDate(index, 'EUR', 'JPY', '2026-03-20T00:00:00.000Z')).toBeNull()
  })
})

describe('convertOnDate', () => {
  const index = buildFxIndex(EGP_HISTORY)

  it('converts at the transaction-date rate, not the latest one', () => {
    // 56,000 EGP paid in Feb: 56000 / 53 = 1056.60, NOT 56000/60 = 933.33
    const result = convertOnDate(index, 56000, 'EGP', 'EUR', '2026-02-20T00:00:00.000Z')
    expect(result.basis).toBe('historical')
    expect(result.amount).toBe(1056.6)
  })

  it('is an identity when currencies match, with no rate lookup', () => {
    const result = convertOnDate(buildFxIndex([]), 1234.567, 'EUR', 'EUR', '2026-03-01')
    expect(result.basis).toBe('same-currency')
    expect(result.amount).toBe(1234.57)
    expect(result.rate).toBe(1)
  })

  it('falls back to a live rate and labels it as such', () => {
    const result = convertOnDate(
      index,
      1000,
      'EGP',
      'EUR',
      '2020-01-01T00:00:00.000Z',
      () => 1 / 62
    )
    expect(result.basis).toBe('live')
    expect(result.amount).toBeCloseTo(16.13, 2)
  })

  it('prefers a historical rate over the live fallback', () => {
    const result = convertOnDate(index, 5600, 'EGP', 'EUR', '2026-03-20T00:00:00.000Z', () => 999)
    expect(result.basis).toBe('historical')
    expect(result.amount).toBe(100)
  })

  it('returns a hole — never the raw amount — when no rate exists anywhere', () => {
    const result = convertOnDate(buildFxIndex([]), 1000, 'EGP', 'EUR', '2026-03-20')
    expect(result.basis).toBe('none')
    expect(result.amount).toBeNull()
    expect(result.rate).toBeNull()
  })

  it('treats an unusable live rate as no rate at all', () => {
    for (const bad of [0, -1, NaN, null]) {
      const result = convertOnDate(buildFxIndex([]), 1000, 'EGP', 'EUR', '2026-03-20', () => bad as number)
      expect(result.basis).toBe('none')
      expect(result.amount).toBeNull()
    }
  })

  it('rejects a non-finite amount instead of producing NaN money', () => {
    const result = convertOnDate(index, NaN, 'EGP', 'EUR', '2026-03-20T00:00:00.000Z')
    expect(result.basis).toBe('none')
    expect(result.amount).toBeNull()
  })

  it('carries the pivot through on a cross conversion', () => {
    const crossIndex = buildFxIndex([
      snapshot('EUR', 'USD', 1.2, '2026-03-15T00:00:00.000Z'),
      snapshot('EUR', 'EGP', 60, '2026-03-15T00:00:00.000Z'),
    ])
    const result = convertOnDate(crossIndex, 100, 'USD', 'EGP', '2026-03-20T00:00:00.000Z')
    expect(result.via).toBe('EUR')
    expect(result.amount).toBeCloseTo(5000, 6)
  })
})

describe('roundMoney', () => {
  it('rounds to two decimals', () => {
    expect(roundMoney(1056.6037735)).toBe(1056.6)
    expect(roundMoney(0.005)).toBe(0.01)
  })

  it('rounds half away from zero symmetrically', () => {
    expect(roundMoney(2.675)).toBe(2.68)
    expect(roundMoney(-2.675)).toBe(-2.68)
  })

  it('never yields negative zero', () => {
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true)
  })
})

describe('collectRequiredPairs', () => {
  it('lists only the currencies actually in play, plus the target', () => {
    const pairs = collectRequiredPairs(
      [{ currency: 'EGP' }, { currency: 'USD' }, { currency: 'EUR' }],
      'EUR'
    )
    expect(pairs).toEqual(['EGP', 'EUR', 'USD'])
  })

  it('returns nothing when every row already matches the target', () => {
    expect(collectRequiredPairs([{ currency: 'EUR' }, { currency: 'eur' }], 'EUR')).toEqual([])
  })

  it('includes the pivot so cross rates can resolve', () => {
    expect(collectRequiredPairs([{ currency: 'EGP' }], 'USD', 'EUR')).toEqual(['EGP', 'EUR', 'USD'])
  })

  it('ignores rows with no currency', () => {
    expect(collectRequiredPairs([{ currency: null }, { currency: '' }, {}], 'EUR')).toEqual([])
  })
})

describe('describeConversion', () => {
  it('names the date behind a historical rate', () => {
    const index = buildFxIndex(EGP_HISTORY)
    const conversion = convertOnDate(index, 5600, 'EGP', 'EUR', '2026-03-20T00:00:00.000Z')
    expect(describeConversion(conversion, 'EGP', 'EUR')).toContain('2026-03-15')
  })

  it('says plainly when today’s rate stood in', () => {
    const conversion = convertOnDate(buildFxIndex([]), 100, 'EGP', 'EUR', '2026-03-20', () => 0.02)
    expect(describeConversion(conversion, 'EGP', 'EUR')).toContain("today's rate")
  })

  it('says plainly when an amount was excluded', () => {
    const conversion = convertOnDate(buildFxIndex([]), 100, 'EGP', 'EUR', '2026-03-20')
    expect(describeConversion(conversion, 'EGP', 'EUR')).toContain('excluded from totals')
  })
})
