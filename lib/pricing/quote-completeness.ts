// ============================================
// Is a saved quote fully priced?
// ============================================
// Answered from the quote's OWN saved lines, not from a separate flag.
//
// Every service the engine cannot price is kept in the quote at 0 with
// `unpriced: true` and the reason in `issue` (PricedService in
// lib/auto-pricing-service, listed in its day since the breakdown-order work).
// Those lines ARE the record of what is missing, and they travel with the
// quote: saved, restored by a version revert, copied by a duplicate. A
// separate stored flag would need its own migration, its own version handling,
// and could disagree with the lines — this cannot.
//
// A quote saved before that change carries no such lines and reads as
// complete: nothing about it is known, and blocking every old quote would be
// wrong. Pure: no database, no framework.
//
// Ported from the sibling app (travel-ops-pro #448).

export interface QuoteGap {
  /** The service as the quote names it. */
  name: string
  /** The day it belongs to, or null for a whole-trip line. */
  day: number | null
  /** What is missing, in the operator's words. */
  issue: string
}

export interface QuoteCompleteness {
  complete: boolean
  gaps: QuoteGap[]
}

/** Reads a quote's services_snapshot — camelCase from the engine, snake_case
 *  from the B2B response shape; both are stored in the wild. */
export function quoteCompleteness(servicesSnapshot: unknown): QuoteCompleteness {
  const lines = Array.isArray(servicesSnapshot) ? servicesSnapshot : []
  const gaps: QuoteGap[] = []
  for (const raw of lines) {
    if (!raw || typeof raw !== 'object') continue
    const line = raw as Record<string, unknown>
    if (line.unpriced !== true) continue
    const day = Number(line.day_number ?? line.dayNumber)
    gaps.push({
      name: String(line.service_name ?? line.serviceName ?? 'Service'),
      day: Number.isFinite(day) && day > 0 ? day : null,
      issue: String(line.issue ?? 'No rate'),
    })
  }
  return { complete: gaps.length === 0, gaps }
}

/**
 * Did the caller explicitly accept an incomplete price? Only an unambiguous
 * yes counts — a missing, false, empty or garbled value never waves a quote
 * through.
 */
export function allowsIncomplete(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1
}

/** One line per gap, for a refusal message. */
export function describeGaps(gaps: QuoteGap[], max = 5): string {
  const shown = gaps.slice(0, max).map(g => (g.day ? `${g.name} (day ${g.day})` : g.name))
  const more = gaps.length > max ? ` and ${gaps.length - max} more` : ''
  return shown.join(', ') + more
}
