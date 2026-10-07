// ============================================
// Where a trip stands, what to do next, and what needs attention
// ============================================
// The itinerary page had ten header buttons in seven colours and nothing
// said which one was the next thing to do. This works it out from what the
// page already knows — the itinerary's status, its booking, its invoice and
// the money the Profit & Loss report reads (lib/trip-pnl.ts) — so the page
// can show one main button and a short list of what is wrong.
//
// Derived, never stored. Pure: the page and the tests share it.

export type StepKey = 'quoted' | 'confirmed' | 'booked' | 'invoiced' | 'paid' | 'operated'

export interface TripFacts {
  /** itineraries.status: draft | sent | confirmed | completed | cancelled */
  status: string | null | undefined
  hasBooking: boolean
  hasInvoice: boolean
  /** From the P&L: what was invoiced and what was paid, in the trip's currency. */
  invoiced: number | null
  paid: number | null
  startDate: string | null | undefined
  endDate: string | null | undefined
  /** YYYY-MM-DD, the agency's today. */
  today: string
}

export interface Step {
  key: StepKey
  label: string
  done: boolean
  /** The first step not done: where the trip is now. */
  current: boolean
}

const LABELS: Record<StepKey, string> = {
  quoted: 'Quoted',
  confirmed: 'Confirmed',
  booked: 'Booked',
  invoiced: 'Invoiced',
  paid: 'Paid',
  operated: 'Operated',
}

const day = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : null)

export function isPaidInFull(f: Pick<TripFacts, 'invoiced' | 'paid'>): boolean {
  return f.invoiced != null && f.paid != null && f.invoiced > 0 && f.paid >= f.invoiced - 0.005
}

export function tripSteps(f: TripFacts): Step[] {
  const status = String(f.status ?? '').toLowerCase()
  const end = day(f.endDate)
  const done: Record<StepKey, boolean> = {
    quoted: status !== 'draft' && status !== '',
    confirmed: status === 'confirmed' || status === 'completed' || f.hasBooking,
    booked: f.hasBooking,
    invoiced: f.hasInvoice,
    paid: isPaidInFull(f),
    operated: status === 'completed' || (!!end && end < f.today),
  }
  // A later step done means the earlier ones were passed, whatever was recorded.
  const order: StepKey[] = ['quoted', 'confirmed', 'booked', 'invoiced', 'paid', 'operated']
  for (let i = order.length - 1; i > 0; i--) {
    if (done[order[i]] && order[i] !== 'operated' && order[i] !== 'paid') {
      for (let j = 0; j < i; j++) done[order[j]] = true
    }
  }
  const firstOpen = order.find(k => !done[k])
  return order.map(k => ({ key: k, label: LABELS[k], done: done[k], current: k === firstOpen }))
}

export type PrimaryKind =
  | 'send_quote'
  | 'convert'
  | 'create_invoice'
  | 'record_payment'
  | 'assign_resources'
  | 'open_trip_log'
  | 'close_out'

export interface PrimaryAction {
  kind: PrimaryKind
  label: string
}

/** The one thing to do next, or null when nothing is (cancelled, closed). */
export function nextAction(f: TripFacts): PrimaryAction | null {
  const status = String(f.status ?? '').toLowerCase()
  if (status === 'cancelled' || status === 'completed') return null
  const start = day(f.startDate)
  const end = day(f.endDate)
  const ended = !!end && end < f.today

  if (ended) return { kind: 'close_out', label: 'Close out trip' }
  if (status === 'draft' || status === '') return { kind: 'send_quote', label: 'Send quote' }
  if (!f.hasBooking) return { kind: 'convert', label: status === 'confirmed' ? 'Create booking' : 'Convert to booking' }
  if (!f.hasInvoice) return { kind: 'create_invoice', label: 'Create invoice' }
  if (!isPaidInFull(f)) return { kind: 'record_payment', label: 'Record payment' }
  if (start && f.today >= start) return { kind: 'open_trip_log', label: 'Open trip log' }
  return { kind: 'assign_resources', label: 'Assign resources' }
}

// ── Which section to open ─────────────────────────────────────────────────

export type TabKey = 'itinerary' | 'operations' | 'finance' | 'messages'

/** Before the trip, its days; while it runs, its operations; after, its money. */
export function defaultTab(f: Pick<TripFacts, 'startDate' | 'endDate' | 'today' | 'status'>): TabKey {
  const start = day(f.startDate)
  const end = day(f.endDate)
  if (String(f.status ?? '').toLowerCase() === 'cancelled') return 'itinerary'
  if (end && end < f.today) return 'finance'
  if (start && f.today >= start) return 'operations'
  return 'itinerary'
}

// ── What needs attention ───────────────────────────────────────────────────

export type AttentionAction = 'create_invoice' | 'record_payment' | 'close_out' | 'go_to_day' | 'assign_resources' | 'open_finance'

export interface Attention {
  severity: 'warning' | 'info'
  message: string
  action?: { kind: AttentionAction; label: string; day?: number }
}

export interface AttentionInput extends TripFacts {
  currency: string
  /** A night whose hotel or ship has since left Rates (or was switched off). */
  staleNights: { day: number; property: string; switchedOff: boolean }[]
  /** Cruise boarding dates the ship does not sail (migration 382). */
  cruiseNotes: string[]
  /** How many days before the start an unpaid balance becomes urgent. */
  paymentDueDays?: number
  /** Resource types some day needs with nobody assigned (lib/itineraries/coverage). */
  missingResources?: { label: string; days: number[] }[]
  /** The agency's minimum margin, a markup on cost (tenants.min_margin_percent); null = not set. */
  minMarginPercent?: number | null
  /** The quoted margin, on cost (lib/itineraries/margin quotedMargin); null = nothing priced. */
  quotedMarginPercent?: number | null
  /** Profit so far on the costs recorded (lib/itineraries/margin actualMargin). */
  actualMargin?: { profit: number; percent: number | null } | null
}

const pct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '')}%`

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export function tripAttention(i: AttentionInput): Attention[] {
  const out: Attention[] = []
  const status = String(i.status ?? '').toLowerCase()
  if (status === 'cancelled') return out
  const start = day(i.startDate)
  const end = day(i.endDate)
  const dueDays = i.paymentDueDays ?? 14

  for (const n of i.staleNights) {
    out.push({
      severity: 'warning',
      message: n.switchedOff
        ? `Day ${n.day}: ${n.property} is switched off in your rates — the night can no longer be re-priced or booked from it.`
        : `Day ${n.day}: ${n.property} is no longer in your rates — it was removed after this trip was priced.`,
      action: { kind: 'go_to_day', label: `Go to day ${n.day}`, day: n.day },
    })
  }
  for (const note of i.cruiseNotes) out.push({ severity: 'warning', message: note })

  const balance = i.invoiced != null && i.paid != null ? i.invoiced - i.paid : null
  const untilStart = start ? daysBetween(i.today, start) : null
  const ended = !!end && end < i.today

  if (!ended && untilStart != null && untilStart <= dueDays) {
    const when = untilStart < 0 ? 'already started' : untilStart === 0 ? 'starts today' : `starts in ${untilStart} day${untilStart === 1 ? '' : 's'}`
    if ((status === 'confirmed' || i.hasBooking) && !i.hasInvoice) {
      out.push({ severity: 'warning', message: `The trip ${when} and has no invoice.`, action: { kind: 'create_invoice', label: 'Create invoice' } })
    } else if (i.hasInvoice && balance != null && balance > 0.005) {
      out.push({
        severity: 'warning',
        message: `The trip ${when} with ${i.currency} ${balance.toFixed(2)} still unpaid.`,
        action: { kind: 'record_payment', label: 'Record payment' },
      })
    }
  }

  // A guide or a vehicle still missing matters once the trip is booked and close.
  if (!ended && untilStart != null && untilStart <= dueDays && (status === 'confirmed' || i.hasBooking)) {
    for (const m of i.missingResources ?? []) {
      if (m.days.length === 0) continue
      const which = m.days.length === 1 ? `day ${m.days[0]}` : `days ${m.days.slice(0, -1).join(', ')} and ${m.days[m.days.length - 1]}`
      out.push({
        severity: 'warning',
        message: `No ${m.label.toLowerCase()} assigned for ${which}.`,
        action: { kind: 'assign_resources', label: 'Assign' },
      })
    }
  }

  // Margin: a loss already booked is said whether or not a minimum is set;
  // below the agency's minimum only once it has set one.
  const min = i.minMarginPercent
  const actual = i.actualMargin
  if (actual && actual.profit < -0.005) {
    out.push({
      severity: 'warning',
      message: `This trip is losing money so far: ${i.currency} ${actual.profit.toFixed(2)} after the costs recorded.`,
      action: { kind: 'open_finance', label: 'Open finance' },
    })
  } else if (min != null && actual?.percent != null && actual.percent < min - 0.05) {
    out.push({
      severity: 'warning',
      message: `Profit so far is ${pct(actual.percent)} on cost — below your ${pct(min)} minimum.`,
      action: { kind: 'open_finance', label: 'Open finance' },
    })
  } else if (min != null && !actual && i.quotedMarginPercent != null && i.quotedMarginPercent < min - 0.05) {
    out.push({
      severity: 'warning',
      message: `The quoted margin is ${pct(i.quotedMarginPercent)} on cost — below your ${pct(min)} minimum.`,
      action: { kind: 'open_finance', label: 'Open finance' },
    })
  }

  if (ended && status !== 'completed') {
    out.push({
      severity: 'info',
      message: `The trip ended on ${end} and is still marked ${status || 'open'}.`,
      action: { kind: 'close_out', label: 'Close out trip' },
    })
  }
  return out
}
