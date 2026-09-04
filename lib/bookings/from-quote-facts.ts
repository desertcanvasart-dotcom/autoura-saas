// ============================================
// What a booking needs to know, read from the quote that sold it
// ============================================
// /api/bookings/from-quote used to write B2B bookings with
// `total_amount = 0` ("B2B pricing is in pricing_table") and
// `num_travelers = 2` — a stale assumption from before migration 270 gave
// b2b_quotes real selling_price / num_adults / num_children columns. A
// booking whose frozen price is zero is not a booking, it is a hole wearing
// a booking number.
//
// These helpers resolve the money and the pax from what the quote actually
// holds, and REFUSE with a named gap when it holds nothing — the booking is
// a frozen financial snapshot, so a guessed total is worse than no booking.

export interface B2bQuoteForBooking {
  selling_price: number | null
  pricing_table: unknown
  num_adults: number | null
  num_children: number | null
}

interface PricingRow {
  pax: number
  total: number
}

type Facts<T> = { ok: true; value: T } | { ok: false; error: string }

function usableNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

/** The multi-pax sheet rows that carry a usable {pax, total}. */
function pricingRows(table: unknown): PricingRow[] {
  if (!Array.isArray(table)) return []
  const rows: PricingRow[] = []
  for (const row of table) {
    if (!row || typeof row !== 'object') continue
    const pax = usableNumber((row as Record<string, unknown>).pax)
    const total = usableNumber((row as Record<string, unknown>).total)
    if (pax != null && total != null) rows.push({ pax: Math.floor(pax), total })
  }
  return rows
}

/**
 * How many travellers a B2B quote is for.
 *
 * num_adults + num_children (migration 270) wins; a legacy quote that only
 * has a single-row pricing sheet answers from that row's pax. Anything else
 * is a refusal, never a default of 2.
 */
export function b2bNumTravelers(quote: B2bQuoteForBooking): Facts<number> {
  const pax = (quote.num_adults ?? 0) + (quote.num_children ?? 0)
  if (pax > 0) return { ok: true, value: pax }

  const rows = pricingRows(quote.pricing_table)
  if (rows.length === 1) return { ok: true, value: rows[0].pax }

  return {
    ok: false,
    error:
      'This quote does not say how many travellers it is for — set the number of travellers on the quote before converting it.',
  }
}

/**
 * The frozen total for a B2B booking.
 *
 * selling_price (migration 270) wins; a legacy quote answers from the
 * pricing-table row for its own pax count (or the only row there is).
 * No usable figure is a refusal — a booking must never freeze a zero the
 * quote never contained.
 */
export function b2bTotalAmount(quote: B2bQuoteForBooking, numTravelers: number): Facts<number> {
  const selling = usableNumber(quote.selling_price)
  if (selling != null) return { ok: true, value: selling }

  const rows = pricingRows(quote.pricing_table)
  const forPax = rows.find(r => r.pax === numTravelers)
  if (forPax) return { ok: true, value: forPax.total }
  if (rows.length === 1) return { ok: true, value: rows[0].total }

  return {
    ok: false,
    error:
      'This quote has no priced total — price it (or re-save it from the calculator) before converting it to a booking.',
  }
}

export interface CalculatorTripInput {
  trip_name: string | null
  travel_date: string | null
  variation: {
    variation_name: string
    template_name: string | null
    duration_days: number | null
  } | null
}

export interface CalculatorTripFacts {
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
}

/**
 * Trip facts for a booking born from a CALCULATOR quote — one saved against
 * a tour variation, with no itinerary (migration 270: "calculator quotes
 * have no itinerary_id"). The dates come from the quote's travel date plus
 * the programme's duration; the name from the quote, else the programme.
 */
export function calculatorTripFacts(input: CalculatorTripInput): Facts<CalculatorTripFacts> {
  if (!input.travel_date) {
    return {
      ok: false,
      error: 'This quote has no travel date — set one on the quote before converting it to a booking.',
    }
  }
  if (!input.variation) {
    return {
      ok: false,
      error:
        'The tour variation this quote was priced from no longer exists — it cannot be converted. Re-quote the trip from a current programme.',
    }
  }

  const durationDays = usableNumber(input.variation.duration_days)
  if (durationDays == null) {
    return {
      ok: false,
      error: `"${input.variation.variation_name}" has no duration — set the programme's duration before converting this quote.`,
    }
  }

  const totalDays = Math.max(1, Math.floor(durationDays))
  const start = new Date(`${input.travel_date}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: `The quote's travel date ("${input.travel_date}") is not a valid date.` }
  }
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + totalDays - 1)

  const tripName =
    (input.trip_name || '').trim() ||
    [input.variation.template_name, input.variation.variation_name].filter(Boolean).join(' — ')

  return {
    ok: true,
    value: {
      trip_name: tripName || input.variation.variation_name,
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
      total_days: totalDays,
    },
  }
}
