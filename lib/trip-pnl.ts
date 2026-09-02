// ============================================
// PER-TRIP P&L — the real margin, not the quoted one
// ============================================
// Pure computation behind GET /api/profit-loss. Kept out of the route so the
// arithmetic is testable without a database.
//
// Two things this module exists to get right, both of which the previous
// inline version got wrong:
//
//   1. COMMISSIONS ARE PART OF MARGIN. A trip that pays a referring agent
//      15% has 15% less margin. Commissions lived in their own module and
//      never reached the P&L, so every trip with an agent relationship
//      reported a profit the operator never made.
//
//   2. COSTS ARE NOT ALL IN THE TRIP'S CURRENCY. Summing 1000 EGP into a
//      EUR trip as "1000" overstates cost ~56x; ignoring the currency the
//      other way overstates margin. Each cost is converted at the rate on
//      the date the money actually moved (lib/fx-conversion.ts).
//
// POLICY: a cost that cannot be converted is never guessed and never summed
// at face value. It is excluded and recorded as a hole, and the trip is
// marked `complete: false`. Under-reporting a cost silently would inflate
// margin — the precise failure this module is meant to prevent — so an
// incomplete trip says so.

import {
  buildFxIndex,
  convertOnDate,
  roundMoney,
  emptyFxSummary,
  tallyFx,
  mergeFxSummary,
  type FxIndex,
  type FxHole,
  type FxSnapshotRow,
  type FxSummary,
} from './fx-conversion'

export type { FxSummary } from './fx-conversion'

// ============================================
// INPUT SHAPES (subsets of the DB rows we actually read)
// ============================================

export interface PnlItinerary {
  id: string
  itinerary_code?: string | null
  trip_name?: string | null
  client_name?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
  currency?: string | null
  total_cost?: number | string | null
}

/**
 * A confirmed extra or upgrade (booking_extras, migration 321), sold after the
 * trip was priced. It never reaches the itinerary, so without this the report
 * would count what an extra earns (once invoiced) and nothing of what it
 * cost, and every extra would read as pure profit. Ported from travel-ops-pro.
 */
export interface PnlExtra {
  title?: string | null
  quantity?: number | string | null
  unit_price?: number | string | null
  currency?: string | null
  supplier_cost?: number | string | null
  supplier_currency?: string | null
  /** The date its money became real — what any conversion is done on. */
  confirmed_at?: string | null
}

export interface PnlInvoice {
  itinerary_id: string | null
  invoice_number?: string | null
  total_amount?: number | string | null
  amount_paid?: number | string | null
  currency?: string | null
  status?: string | null
  issue_date?: string | null
  paid_at?: string | null
}

export interface PnlExpense {
  itinerary_id: string | null
  expense_number?: string | null
  amount?: number | string | null
  currency?: string | null
  category?: string | null
  status?: string | null
  expense_date?: string | null
  payment_date?: string | null
}

export interface PnlCommission {
  itinerary_id: string | null
  description?: string | null
  source_name?: string | null
  commission_amount?: number | string | null
  currency?: string | null
  /** 'receivable' = money in (adds to margin). 'payable' = money out. */
  commission_type?: string | null
  category?: string | null
  status?: string | null
  transaction_date?: string | null
  paid_date?: string | null
  due_date?: string | null
}

// ============================================
// OUTPUT SHAPE
// ============================================

export interface TripPnL {
  itinerary_id: string
  itinerary_code: string
  trip_name: string
  client_name: string
  start_date: string
  end_date: string
  status: string
  currency: string

  quoted_amount: number
  /** Of quoted_amount, what came from extras sold after the trip was priced. */
  extras_revenue: number
  /** What those extras cost us, in the trip currency. */
  extras_supplier_cost: number
  total_revenue: number
  total_paid: number

  total_expenses: number
  expenses_paid: number
  expenses_pending: number
  expense_breakdown: Record<string, number>

  /** Commission income (hotel, shopping, ...) — increases margin. */
  commissions_receivable: number
  /** Commission owed out (referring agents, partners) — decreases margin. */
  commissions_payable: number
  /** receivable - payable. Negative when the trip pays out more than it earns. */
  net_commission: number
  /**
   * Receivable commission in dispute. NOT part of net_commission or
   * gross_profit — surfaced so the operator sees the potential upside without
   * the margin depending on it.
   */
  disputed_receivable: number
  commission_breakdown: Record<string, { receivable: number; payable: number }>

  gross_profit: number
  profit_margin: number

  invoice_count: number
  expense_count: number
  commission_count: number

  fx: FxSummary
  /** False when any line was dropped for lack of a rate. */
  complete: boolean
  holes: FxHole[]
}

export interface PnlSummary {
  total_trips: number
  /** Currency every figure in this summary is expressed in. */
  reporting_currency: string
  total_revenue: number
  total_expenses: number
  total_commissions_receivable: number
  total_commissions_payable: number
  /** Receivable commission in dispute — excluded from total_profit. */
  total_disputed_receivable: number
  total_profit: number
  average_margin: number
  profitable_trips: number
  loss_trips: number
  /** Trips whose totals are missing at least one line. */
  incomplete_trips: number
  /** Trips that could not be expressed in the reporting currency at all. */
  untranslated_trips: number
  fx: FxSummary
}

// ============================================
// HELPERS
// ============================================

const EXCLUDED_INVOICE_STATUSES = new Set(['cancelled'])
/** A rejected expense is not a cost. The old code summed it as one. */
const EXCLUDED_EXPENSE_STATUSES = new Set(['rejected'])
const EXCLUDED_COMMISSION_STATUSES = new Set(['cancelled'])
/**
 * Disputed commissions are treated ASYMMETRICALLY by direction, on prudence:
 * a disputed payable will probably still be paid (include it as a cost), a
 * disputed receivable may never arrive (exclude it, and surface it separately
 * so the operator sees the upside without the margin assuming it).
 */
const DISPUTED_STATUS = 'disputed'

function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function currencyOf(value: string | null | undefined, fallback: string): string {
  const c = (value || '').trim().toUpperCase()
  return c || fallback
}

/**
 * The date whose exchange rate applies to a cost.
 * Payment date when the money has actually moved, otherwise the date the
 * cost was incurred. This is the whole point: a hotel invoiced in January
 * and paid in April carries April's rate, not January's.
 */
function effectiveExpenseDate(expense: PnlExpense): string | null {
  return expense.payment_date || expense.expense_date || null
}

function effectiveCommissionDate(commission: PnlCommission): string | null {
  return commission.paid_date || commission.transaction_date || commission.due_date || null
}

function effectiveInvoiceDate(invoice: PnlInvoice): string | null {
  return invoice.paid_at || invoice.issue_date || null
}

// ============================================
// PER-TRIP COMPUTATION
// ============================================

export interface ComputeTripPnLInput {
  itinerary: PnlItinerary
  invoices: PnlInvoice[]
  expenses: PnlExpense[]
  commissions: PnlCommission[]
  /** CONFIRMED extras and upgrades sold on this trip's booking. Optional:
   *  absent before migration 321. */
  extras?: PnlExtra[]
  fxIndex: FxIndex
  liveRate?: (from: string, to: string) => number | null
}

export function computeTripPnL(input: ComputeTripPnLInput): TripPnL {
  const { itinerary, invoices, expenses, commissions, fxIndex, liveRate } = input
  const extras = input.extras ?? []
  const tripCurrency = currencyOf(itinerary.currency, 'EUR')
  const fx = emptyFxSummary()
  const holes: FxHole[] = []

  // ---------- Revenue ----------
  let totalRevenue = 0
  let totalPaid = 0
  let invoiceCount = 0

  for (const invoice of invoices) {
    if (EXCLUDED_INVOICE_STATUSES.has((invoice.status || '').toLowerCase())) continue
    invoiceCount++

    const from = currencyOf(invoice.currency, tripCurrency)
    const date = effectiveInvoiceDate(invoice)

    const total = convertOnDate(fxIndex, num(invoice.total_amount), from, tripCurrency, date, liveRate)
    tallyFx(fx, total.basis)

    if (total.amount === null) {
      holes.push({
        kind: 'invoice',
        reference: invoice.invoice_number || 'invoice',
        amount: num(invoice.total_amount),
        fromCurrency: from,
        toCurrency: tripCurrency,
        date,
        message: `Invoice ${invoice.invoice_number || ''} is in ${from} and no ${from}/${tripCurrency} rate is available — excluded from revenue.`.trim(),
      })
    } else {
      totalRevenue += total.amount
    }

    // amount_paid rides the same rate as its invoice — no second lookup.
    if (total.rate !== null) {
      totalPaid += roundMoney(num(invoice.amount_paid) * total.rate)
    }
  }

  // ---------- Expenses ----------
  let totalExpenses = 0
  let expensesPaid = 0
  let expensesPending = 0
  let expenseCount = 0
  const expenseBreakdown: Record<string, number> = {}

  for (const expense of expenses) {
    const status = (expense.status || '').toLowerCase()
    if (EXCLUDED_EXPENSE_STATUSES.has(status)) continue
    expenseCount++

    const from = currencyOf(expense.currency, tripCurrency)
    const date = effectiveExpenseDate(expense)
    const converted = convertOnDate(fxIndex, num(expense.amount), from, tripCurrency, date, liveRate)
    tallyFx(fx, converted.basis)

    if (converted.amount === null) {
      holes.push({
        kind: 'expense',
        reference: expense.expense_number || expense.category || 'expense',
        amount: num(expense.amount),
        fromCurrency: from,
        toCurrency: tripCurrency,
        date,
        message: `Expense ${expense.expense_number || ''} is in ${from} and no ${from}/${tripCurrency} rate is available for ${date || 'its date'} — excluded from costs, so this trip's margin is overstated.`.trim(),
      })
      continue
    }

    totalExpenses += converted.amount
    if (status === 'paid') expensesPaid += converted.amount
    else expensesPending += converted.amount

    const category = expense.category || 'other'
    expenseBreakdown[category] = roundMoney((expenseBreakdown[category] || 0) + converted.amount)
  }

  // ---------- Commissions ----------
  let commissionsReceivable = 0
  let commissionsPayable = 0
  let disputedReceivable = 0
  let commissionCount = 0
  const commissionBreakdown: Record<string, { receivable: number; payable: number }> = {}

  for (const commission of commissions) {
    const status = (commission.status || '').toLowerCase()
    if (EXCLUDED_COMMISSION_STATUSES.has(status)) continue
    commissionCount++

    const from = currencyOf(commission.currency, tripCurrency)
    const date = effectiveCommissionDate(commission)
    const converted = convertOnDate(fxIndex, num(commission.commission_amount), from, tripCurrency, date, liveRate)
    tallyFx(fx, converted.basis)

    const label = commission.description || commission.source_name || commission.category || 'commission'

    if (converted.amount === null) {
      holes.push({
        kind: 'commission',
        reference: label,
        amount: num(commission.commission_amount),
        fromCurrency: from,
        toCurrency: tripCurrency,
        date,
        message: `Commission "${label}" is in ${from} and no ${from}/${tripCurrency} rate is available for ${date || 'its date'} — excluded from margin.`,
      })
      continue
    }

    const isPayable = (commission.commission_type || '').toLowerCase() === 'payable'
    const category = commission.category || 'other'
    if (!commissionBreakdown[category]) {
      commissionBreakdown[category] = { receivable: 0, payable: 0 }
    }

    if (isPayable) {
      // A disputed payable is money you will most likely still pay. Leaving it
      // out would understate the cost of the trip, so prudence includes it.
      commissionsPayable += converted.amount
      commissionBreakdown[category].payable = roundMoney(
        commissionBreakdown[category].payable + converted.amount
      )
    } else if (status === DISPUTED_STATUS) {
      // A disputed RECEIVABLE is money you may never see. Counting it would
      // inflate margin on precisely the trips where something went wrong — the
      // asymmetry with payables is deliberate, not an oversight. It is tracked
      // separately so the operator still sees the upside, without the P&L
      // assuming it.
      disputedReceivable += converted.amount
    } else {
      commissionsReceivable += converted.amount
      commissionBreakdown[category].receivable = roundMoney(
        commissionBreakdown[category].receivable + converted.amount
      )
    }
  }

  // ---------- Extras sold after the trip was priced ----------
  // Revenue in the extra's own currency, cost in the supplier's — each
  // converted on the day the sale became real. What cannot be converted is a
  // hole, reported rather than silently dropped.
  let extrasRevenue = 0
  let extrasSupplierCost = 0
  for (const extra of extras) {
    const qty = Math.max(1, Math.floor(num(extra.quantity)) || 1)
    const date = extra.confirmed_at ?? null
    const priced = convertOnDate(fxIndex, num(extra.unit_price) * qty, currencyOf(extra.currency, tripCurrency), tripCurrency, date, liveRate)
    tallyFx(fx, priced.basis)
    if (priced.amount === null) {
      holes.push({ kind: 'extra', reference: extra.title || 'extra', amount: num(extra.unit_price) * qty, fromCurrency: currencyOf(extra.currency, tripCurrency), toCurrency: tripCurrency, date, message: `Extra "${extra.title || ''}" is in ${currencyOf(extra.currency, tripCurrency)} and no rate to ${tripCurrency} is available — excluded.`.trim() })
    } else extrasRevenue += priced.amount
    if (num(extra.supplier_cost) > 0) {
      const cost = convertOnDate(fxIndex, num(extra.supplier_cost) * qty, currencyOf(extra.supplier_currency, tripCurrency), tripCurrency, date, liveRate)
      tallyFx(fx, cost.basis)
      if (cost.amount !== null) extrasSupplierCost += cost.amount
    }
  }

  // ---------- Margin ----------
  // Revenue falls back to the quoted amount when nothing has been invoiced
  // yet, so a trip in progress still shows a margin. The quote is already in
  // the trip currency by construction.
  const revenueForCalc = totalRevenue > 0 ? totalRevenue : num(itinerary.total_cost) + extrasRevenue

  const grossProfit = roundMoney(
    revenueForCalc - totalExpenses - extrasSupplierCost - commissionsPayable + commissionsReceivable
  )
  const profitMargin = revenueForCalc > 0 ? (grossProfit / revenueForCalc) * 100 : 0

  return {
    itinerary_id: itinerary.id,
    itinerary_code: itinerary.itinerary_code || '',
    trip_name: itinerary.trip_name || '',
    client_name: itinerary.client_name || '',
    start_date: itinerary.start_date || '',
    end_date: itinerary.end_date || '',
    status: itinerary.status || '',
    currency: tripCurrency,

    // Quoted plus what was sold afterwards — otherwise quoted and invoiced
    // diverge by the extras and the difference reads as an overcharge.
    quoted_amount: roundMoney(num(itinerary.total_cost) + extrasRevenue),
    extras_revenue: roundMoney(extrasRevenue),
    extras_supplier_cost: roundMoney(extrasSupplierCost),
    total_revenue: roundMoney(totalRevenue),
    total_paid: roundMoney(totalPaid),

    total_expenses: roundMoney(totalExpenses),
    expenses_paid: roundMoney(expensesPaid),
    expenses_pending: roundMoney(expensesPending),
    expense_breakdown: expenseBreakdown,

    commissions_receivable: roundMoney(commissionsReceivable),
    commissions_payable: roundMoney(commissionsPayable),
    net_commission: roundMoney(commissionsReceivable - commissionsPayable),
    disputed_receivable: roundMoney(disputedReceivable),
    commission_breakdown: commissionBreakdown,

    gross_profit: grossProfit,
    profit_margin: profitMargin,

    invoice_count: invoiceCount,
    expense_count: expenseCount,
    commission_count: commissionCount,

    fx,
    complete: holes.length === 0,
    holes,
  }
}

// ============================================
// PORTFOLIO SUMMARY
// ============================================

export interface BuildSummaryInput {
  trips: TripPnL[]
  reportingCurrency: string
  fxIndex: FxIndex
  liveRate?: (from: string, to: string) => number | null
}

/**
 * Roll trips up into one set of figures.
 *
 * Every trip is converted into a single reporting currency first. The old
 * summary added a EUR trip's profit to an EGP trip's profit and printed the
 * result with a euro sign — a number that meant nothing. A trip that cannot
 * be expressed in the reporting currency is counted in `untranslated_trips`
 * and left out of the money totals rather than added at face value.
 *
 * Trip-level conversion uses the trip's start date, so a portfolio view of
 * last year reads in last year's money.
 */
export function buildPnlSummary(input: BuildSummaryInput): PnlSummary {
  const { trips, fxIndex, liveRate } = input
  const reportingCurrency = currencyOf(input.reportingCurrency, 'EUR')

  const fx = emptyFxSummary()
  let totalRevenue = 0
  let totalExpenses = 0
  let totalReceivable = 0
  let totalPayable = 0
  let totalDisputedReceivable = 0
  let totalProfit = 0
  let marginSum = 0
  let marginCount = 0
  let untranslated = 0

  for (const trip of trips) {
    mergeFxSummary(fx, trip.fx)

    const revenueBasis = trip.total_revenue > 0 ? trip.total_revenue : trip.quoted_amount
    const rateProbe = convertOnDate(
      fxIndex,
      1,
      trip.currency,
      reportingCurrency,
      trip.start_date || null,
      liveRate
    )

    if (rateProbe.rate === null) {
      untranslated++
      tallyFx(fx, 'none')
      continue
    }
    if (trip.currency !== reportingCurrency) {
      tallyFx(fx, rateProbe.basis)
    }

    const rate = rateProbe.rate
    totalRevenue += roundMoney(revenueBasis * rate)
    totalExpenses += roundMoney(trip.total_expenses * rate)
    totalReceivable += roundMoney(trip.commissions_receivable * rate)
    totalPayable += roundMoney(trip.commissions_payable * rate)
    totalDisputedReceivable += roundMoney(trip.disputed_receivable * rate)
    totalProfit += roundMoney(trip.gross_profit * rate)

    // Margin is a ratio — currency-independent, so it averages directly.
    marginSum += trip.profit_margin
    marginCount++
  }

  return {
    total_trips: trips.length,
    reporting_currency: reportingCurrency,
    total_revenue: roundMoney(totalRevenue),
    total_expenses: roundMoney(totalExpenses),
    total_commissions_receivable: roundMoney(totalReceivable),
    total_commissions_payable: roundMoney(totalPayable),
    total_disputed_receivable: roundMoney(totalDisputedReceivable),
    total_profit: roundMoney(totalProfit),
    average_margin: marginCount > 0 ? marginSum / marginCount : 0,
    profitable_trips: trips.filter(t => t.gross_profit > 0).length,
    loss_trips: trips.filter(t => t.gross_profit < 0).length,
    incomplete_trips: trips.filter(t => !t.complete).length,
    untranslated_trips: untranslated,
    fx,
  }
}

/** Convenience for callers holding raw snapshot rows. */
export function indexSnapshots(rows: FxSnapshotRow[] | null | undefined): FxIndex {
  return buildFxIndex(rows)
}
