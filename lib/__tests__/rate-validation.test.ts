import { describe, it, expect } from 'vitest'
import { validateRatePayload } from '@/lib/rate-validation'

// Layer 4 of the pricing harness: rate-entry sanity. See PRICING-HARNESS-PLAN.md.

describe('validateRatePayload', () => {
  it('accepts a clean hotel-style payload', () => {
    const r = validateRatePayload({
      property_name: 'Cairo Grand',
      city: 'Cairo',
      tier: 'standard',
      double_rate_eur: 110,
      single_rate_eur: 140,
      ppd_eur: 55,
      single_supplement_eur: 30,
      triple_reduction_eur: 0,
      low_season_from: '2026-01-01', // date — skipped
      rate_valid_from: '2026-01-01', // date containing "rate" — skipped
      is_active: true,
    })
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('rejects a negative rate', () => {
    const r = validateRatePayload({ double_rate_eur: -50 })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/double_rate_eur cannot be negative/)
  })

  it('rejects a negative value passed as a string', () => {
    expect(validateRatePayload({ daily_rate: '-10' }).ok).toBe(false)
  })

  it('rejects an absurdly large rate', () => {
    const r = validateRatePayload({ ppd_eur: 5_000_000 })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/exceeds the maximum/)
  })

  it('does not flag non-money fields like star_rating or capacity', () => {
    expect(validateRatePayload({ star_rating: 5, capacity_max: 14 }).ok).toBe(true)
  })

  it('does not flag date columns that contain "rate"/"season"', () => {
    expect(
      validateRatePayload({
        rate_valid_from: '2026-01-01',
        rate_valid_to: '2026-12-31',
        high_season_from: '2026-06-01',
      }).ok
    ).toBe(true)
  })

  it('handles entrance-fee fields (eur_rate / non_eur_rate)', () => {
    expect(validateRatePayload({ eur_rate: 20, non_eur_rate: 10 }).ok).toBe(true)
    expect(validateRatePayload({ eur_rate: -1 }).ok).toBe(false)
  })

  it('allows zero (e.g. a free attraction or unused room type)', () => {
    expect(validateRatePayload({ suite_rate_eur: 0 }).ok).toBe(true)
  })

  it('rejects a non-object body', () => {
    expect(validateRatePayload(null).ok).toBe(false)
    expect(validateRatePayload(undefined).ok).toBe(false)
  })
})
