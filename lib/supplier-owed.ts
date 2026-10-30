// ============================================
// What a supplier is owed by one agency (Supplier Network Phase 2A)
// ============================================
// Operator, 2026-10-30: suppliers see what they are owed. Read from the
// expenses Phase 1 records when a supplier line is covered (lib/bookings/
// supplier-expense: one per line, booking_supplier_status_id). Only those —
// never an expense the office typed by hand — and only the service name,
// never the expense's internal notes. Rejected ones are not shown.

export type OwedState = 'checking' | 'to_pay' | 'paid'

export const OWED_LABEL: Record<OwedState, string> = {
  checking: 'Being checked',
  to_pay: 'Approved — to be paid',
  paid: 'Paid',
}

/** How far back paid items are listed. */
export const PAID_DAYS = 90

export interface OwedSource {
  id: string
  amount: number | string | null
  currency: string | null
  status: string | null
  expense_date: string | null
  payment_date: string | null
  booking_supplier_status_id: string | null
}

export interface OwedItem {
  id: string
  date: string | null
  service: string
  amount: number
  currency: string
  state: OwedState
  paidOn: string | null
}

const STATE: Record<string, OwedState> = { pending: 'checking', approved: 'to_pay', paid: 'paid' }

export function owedState(status: string | null | undefined): OwedState | null {
  return STATE[status ?? ''] ?? null
}

/** Items, newest first, and the totals not yet paid, per currency. */
export function owedView(
  rows: OwedSource[],
  serviceOf: (lineId: string) => string | null,
  today: string,
): { items: OwedItem[]; unpaid: Array<{ currency: string; amount: number }> } {
  const since = new Date(`${today}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - PAID_DAYS)
  const paidFrom = since.toISOString().slice(0, 10)

  const items: OwedItem[] = []
  const unpaid = new Map<string, number>()
  for (const r of rows) {
    const state = owedState(r.status)
    if (!state || !r.booking_supplier_status_id) continue
    const amount = Math.round(Number(r.amount) * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0) continue
    const currency = (r.currency || '').trim().toUpperCase() || '—'
    if (state === 'paid' && (r.payment_date ?? r.expense_date ?? '') < paidFrom) continue
    items.push({
      id: r.id,
      date: r.expense_date?.slice(0, 10) ?? null,
      service: serviceOf(r.booking_supplier_status_id) ?? 'Service',
      amount,
      currency,
      state,
      paidOn: state === 'paid' ? (r.payment_date?.slice(0, 10) ?? null) : null,
    })
    if (state !== 'paid') unpaid.set(currency, Math.round(((unpaid.get(currency) ?? 0) + amount) * 100) / 100)
  }
  items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  return { items, unpaid: [...unpaid].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => a.currency.localeCompare(b.currency)) }
}
