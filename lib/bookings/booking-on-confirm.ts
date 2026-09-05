// ============================================
// A confirmed itinerary becomes its booking (B-item 7 / A-item 7)
// ============================================
// Confirming used to be a plain status change — the FX snapshot froze and
// nothing else happened; the only road to a booking ran through a quote's
// Convert button. Confirmation IS the commercial event, so the confirm
// flow now creates the booking through these facts — and REFUSES (with the
// reason surfaced to the operator, never blocking the confirm itself) when
// the itinerary cannot honestly be booked. A booking is a frozen financial
// snapshot: no dates, no priced total — no booking, never a zero.

type Facts<T> = { ok: true; value: T } | { ok: false; reason: string }

export interface ItineraryForBooking {
  trip_name?: string | null
  client_name?: string | null
  start_date?: string | null
  end_date?: string | null
  total_days?: number | null
  num_adults?: number | null
  num_children?: number | null
  num_travelers?: number | null
  selling_price?: number | null
  currency?: string | null
}

export interface ItineraryBookingFacts {
  trip_name: string
  start_date: string
  end_date: string
  total_days: number
  num_travelers: number
  total_amount: number
  currency: string
}

function usableMoney(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function itineraryBookingFacts(itinerary: ItineraryForBooking): Facts<ItineraryBookingFacts> {
  if (!itinerary.start_date || !itinerary.end_date) {
    return {
      ok: false,
      reason: 'the itinerary has no start/end dates — set them and re-confirm to create the booking',
    }
  }

  const total = usableMoney(itinerary.selling_price)
  if (total === null) {
    return {
      ok: false,
      reason: 'the itinerary has no selling price — price it and re-confirm to create the booking',
    }
  }

  const pax =
    (itinerary.num_adults ?? 0) + (itinerary.num_children ?? 0) ||
    (Number.isFinite(Number(itinerary.num_travelers)) && Number(itinerary.num_travelers) > 0
      ? Number(itinerary.num_travelers)
      : 0)
  if (pax <= 0) {
    return {
      ok: false,
      reason: 'the itinerary does not say how many travellers — set the traveller count and re-confirm',
    }
  }

  return {
    ok: true,
    value: {
      trip_name: itinerary.trip_name || `Trip for ${itinerary.client_name || 'client'}`,
      start_date: itinerary.start_date,
      end_date: itinerary.end_date,
      total_days: itinerary.total_days || 0,
      num_travelers: pax,
      total_amount: total,
      currency: itinerary.currency || 'EUR',
    },
  }
}
