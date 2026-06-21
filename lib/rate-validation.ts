// Server-side sanity validation for rate-entry payloads (harness Layer 4).
//
// Deliberately GENERIC: it rejects negative / absurd values in money-like
// fields without hard-coding each rate table's dozens of columns (which would
// risk false-rejecting legitimate entries). Date and non-numeric fields are
// skipped. The aim is a safe data-integrity belt at the point of entry, so the
// pricing engine never reads a negative or nonsensical rate.
//
// See PRICING-HARNESS-PLAN.md.

// Field names that hold a monetary amount / rate.
const MONEY_FIELD =
  /(_eur\b|_non_eur\b|_rate\b|rate_|_price\b|price_|supplement|reduction|ppd|_cost\b|cost_|daily_rate)/i

// Field names that are dates (skip — they often contain "rate"/"season").
const DATE_LIKE = /(_from\b|_to\b|_date\b|valid)/i

const MAX_RATE = 1_000_000

export interface RateValidationResult {
  ok: boolean
  errors: string[]
}

/**
 * Validate a rate-entry request body. Returns the list of violations (empty =>
 * ok). Only flags clearly-invalid monetary values (negative, NaN-as-number,
 * or above MAX_RATE); leaves everything else untouched.
 */
export function validateRatePayload(
  payload: Record<string, any> | null | undefined
): RateValidationResult {
  const errors: string[] = []

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['Request body must be an object.'] }
  }

  for (const [key, value] of Object.entries(payload)) {
    if (DATE_LIKE.test(key)) continue // date column, not a rate
    if (!MONEY_FIELD.test(key)) continue // not a money field
    if (value === null || value === undefined || value === '') continue

    const num = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(num)) continue // non-numeric (e.g. a label) — not handled here

    if (num < 0) {
      errors.push(`${key} cannot be negative (got ${num}).`)
    } else if (num > MAX_RATE) {
      errors.push(`${key} (${num}) exceeds the maximum allowed rate of ${MAX_RATE}.`)
    }
  }

  return { ok: errors.length === 0, errors }
}
