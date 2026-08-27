import { describe, it, expect } from 'vitest'
import {
  buildFrozenFx,
  parseFrozenFx,
  computeFxReprice,
  type FrozenRate,
} from '../itinerary-fx'
import type { ExchangeRate } from '../currency'

// P4: FX freeze. The worked example the whole model was designed around:
// a 5000-EGP transport contract confirmed at 50 EGP/EUR costs EUR 100; when the
// pound moves to 55 an EXPLICIT reprice restates it to EUR 90.91 — and the
// client's price never moves.

const RATES_AT_50: FrozenRate[] = [
  { base_currency: 'EUR', target_currency: 'EGP', rate: 50, is_active: true },
]
const RATES_AT_55: FrozenRate[] = [
  { base_currency: 'EUR', target_currency: 'EGP', rate: 55, is_active: true },
]

describe('buildFrozenFx / parseFrozenFx', () => {
  it('snapshots only active rates and round-trips through JSON', () => {
    const src = [
      { base_currency: 'EUR', target_currency: 'EGP', rate: 50, is_active: true },
      { base_currency: 'EUR', target_currency: 'USD', rate: 1.1, is_active: false },
    ] as ExchangeRate[]
    const fx = buildFrozenFx(src, 'user-1', 'confirm', '2026-08-28T10:00:00Z')
    expect(fx.rates).toHaveLength(1)
    expect(fx.frozen_by).toBe('user-1')
    expect(fx.source).toBe('confirm')
    expect(parseFrozenFx(JSON.parse(JSON.stringify(fx)))).toEqual(fx)
  })

  it('parseFrozenFx rejects malformed values', () => {
    expect(parseFrozenFx(null)).toBeNull()
    expect(parseFrozenFx('{}')).toBeNull()
    expect(parseFrozenFx({ rates: 'nope' })).toBeNull()
    expect(parseFrozenFx({ rates: [], frozen_at: undefined })).toBeNull()
  })
})

describe('computeFxReprice', () => {
  it('the worked example: 5000 EGP @50 -> EUR 100, restated @55 -> EUR 90.91', () => {
    const line = {
      id: 'svc-1',
      supplier_currency: 'EGP',
      supplier_cost_original: 5000,
      quantity: 1,
      unit_cost: 100,
      total_cost: 100,
    }
    const at50 = computeFxReprice([line], RATES_AT_50)
    expect(at50.patches[0].total_cost).toBe(100)

    const at55 = computeFxReprice([line], RATES_AT_55)
    expect(at55.patches[0].unit_cost).toBeCloseTo(90.91)
    expect(at55.patches[0].total_cost).toBeCloseTo(90.91)
    expect(at55.patches[0].exchange_rate_used).toBeCloseTo(1 / 55, 5)
  })

  it('multiplies by quantity for total_cost', () => {
    const { patches } = computeFxReprice([{
      id: 'svc-q',
      supplier_currency: 'EGP',
      supplier_cost_original: 550,
      quantity: 4,
    }], RATES_AT_55)
    expect(patches[0].unit_cost).toBe(10)
    expect(patches[0].total_cost).toBe(40)
  })

  it('leaves EUR and currency-less lines untouched', () => {
    const result = computeFxReprice([
      { id: 'a', supplier_currency: 'EUR', supplier_cost_original: 100 },
      { id: 'b', supplier_currency: null, total_cost: 50 },
      { id: 'c' },
    ], RATES_AT_55)
    expect(result.patches).toHaveLength(0)
    expect(result.untouched).toBe(3)
    expect(result.skipped).toHaveLength(0)
  })

  it('NEVER-GUESS: missing original or missing rate → skipped with reason, not restated', () => {
    const result = computeFxReprice([
      { id: 'no-orig', supplier_currency: 'EGP', supplier_cost_original: null },
      { id: 'no-rate', supplier_currency: 'GBP', supplier_cost_original: 80 },
    ], RATES_AT_55)
    expect(result.patches).toHaveLength(0)
    expect(result.skipped.map(x => x.id).sort()).toEqual(['no-orig', 'no-rate'])
    expect(result.skipped.find(x => x.id === 'no-rate')!.reason).toContain('GBP')
  })
})
