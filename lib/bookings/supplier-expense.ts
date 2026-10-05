// ============================================
// Confirming a supplier records what the trip owes them
// ============================================
// Every report (Payables, P&L, trip profitability, cash flow) reads expenses,
// and expenses were only ever typed in by hand — so a trip nobody typed up
// showed ~100% margin and owed nobody. Now a booking's supplier row
// (booking_supplier_status) that is CONFIRMED with a cost becomes a pending
// expense: supplier, category, amount (the confirmed cost, else the quoted
// one), the service date, the trip and booking.
//
// The expense follows its row only while it is still PENDING:
//   * cost or date changes → the expense is updated;
//   * the row leaves 'confirmed' (cancelled, back to contacted…) or loses its
//     cost → the expense is removed — it was never owed;
//   * once someone has approved, paid or rejected it, it is theirs: nothing
//     here touches it again (`kept`).
// One expense per row (expenses.booking_supplier_status_id, unique; 396).

import type { SupabaseClient } from '@supabase/supabase-js'
import { nextDocumentNumber, insertWithUniqueRetry } from '@/lib/document-numbering'

export interface SupplierRowForExpense {
  id: string
  booking_id: string
  supplier_id: string | null
  supplier_type: string
  supplier_name: string
  service_description: string | null
  service_date: string | null
  quoted_cost: number | string | null
  confirmed_cost: number | string | null
  confirmation_number: string | null
  status: string | null
}

export interface LinkedExpense {
  id: string
  expense_number: string
  status: string
  amount: number
  currency: string
  expense_date: string
}

/** Booking supplier type → expense category (lib/expense-categories). */
export function expenseCategoryForSupplierType(type: string | null | undefined): string {
  const map: Record<string, string> = {
    hotel: 'hotel', guide: 'guide', transport: 'transportation', restaurant: 'meal',
    activity: 'activity', entrance: 'entrance', cruise: 'cruise', flight: 'flights',
  }
  return map[(type ?? '').toLowerCase()] ?? 'other'
}

/** Booking supplier type → the supplier-type vocabulary key stored on the expense. */
export function vocabularyTypeForSupplierType(type: string | null | undefined): string {
  const map: Record<string, string> = {
    transport: 'transport_company', flight: 'airline', entrance: 'attraction', activity: 'activity_provider',
  }
  const t = (type ?? '').toLowerCase()
  return map[t] ?? (t || 'other')
}

/** What the agency owes for a row: the confirmed cost, else the quoted one; null when none. */
export function supplierRowCost(row: Pick<SupplierRowForExpense, 'confirmed_cost' | 'quoted_cost'>): number | null {
  for (const v of [row.confirmed_cost, row.quoted_cost]) {
    if (v === null || v === undefined || v === '') continue
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100
  }
  return null
}

export type ExpensePlan =
  | { action: 'create'; amount: number; expense_date: string }
  | { action: 'update'; amount: number; expense_date: string }
  | { action: 'remove' }
  | { action: 'none' }
  | { action: 'kept' }

/** Pure: what to do with the row's expense. */
export function planSupplierExpense(
  row: Pick<SupplierRowForExpense, 'status' | 'confirmed_cost' | 'quoted_cost' | 'service_date'>,
  existing: Pick<LinkedExpense, 'status' | 'amount' | 'expense_date'> | null,
  today: string,
): ExpensePlan {
  if (existing && existing.status !== 'pending') return { action: 'kept' }
  const amount = row.status === 'confirmed' ? supplierRowCost(row) : null
  if (amount === null) return existing ? { action: 'remove' } : { action: 'none' }
  const expense_date = (row.service_date ?? '').slice(0, 10) || today
  if (!existing) return { action: 'create', amount, expense_date }
  if (Number(existing.amount) === amount && existing.expense_date === expense_date) return { action: 'none' }
  return { action: 'update', amount, expense_date }
}

export type SupplierExpenseResult =
  | { ok: true; action: ExpensePlan['action']; expense: LinkedExpense | null }
  | { ok: false; error: string }

const EXPENSE_COLUMNS = 'id, expense_number, status, amount, currency, expense_date'

/**
 * Bring the expense for one booking supplier row in line with the row.
 * `db` is the caller's RLS client (expense numbering is per agency).
 */
export async function syncSupplierExpense(
  db: SupabaseClient,
  tenantId: string,
  rowId: string,
): Promise<SupplierExpenseResult> {
  const { data: row, error: rowErr } = await db
    .from('booking_supplier_status')
    .select('id, booking_id, supplier_id, supplier_type, supplier_name, service_description, service_date, quoted_cost, confirmed_cost, confirmation_number, status')
    .eq('id', rowId)
    .maybeSingle()
  if (rowErr || !row) return { ok: false, error: rowErr?.message || 'Supplier row not found' }

  const { data: existing, error: exErr } = await db
    .from('expenses')
    .select(EXPENSE_COLUMNS)
    .eq('booking_supplier_status_id', rowId)
    .maybeSingle()
  if (exErr) return { ok: false, error: exErr.message }

  const today = new Date().toISOString().slice(0, 10)
  const plan = planSupplierExpense(row as SupplierRowForExpense, existing as LinkedExpense | null, today)

  if (plan.action === 'none' || plan.action === 'kept') {
    return { ok: true, action: plan.action, expense: (existing as LinkedExpense | null) ?? null }
  }

  if (plan.action === 'remove') {
    const { error } = await db.from('expenses').delete().eq('id', existing!.id).eq('status', 'pending')
    if (error) return { ok: false, error: error.message }
    return { ok: true, action: 'remove', expense: null }
  }

  if (plan.action === 'update') {
    const { data, error } = await db
      .from('expenses')
      .update({ amount: plan.amount, expense_date: plan.expense_date, updated_at: new Date().toISOString() })
      .eq('id', existing!.id)
      .eq('status', 'pending')
      .select(EXPENSE_COLUMNS)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    return { ok: true, action: data ? 'update' : 'kept', expense: (data ?? existing) as LinkedExpense }
  }

  // create
  const { data: booking } = await db
    .from('bookings')
    .select('id, booking_number, itinerary_id, currency')
    .eq('id', row.booking_id)
    .maybeSingle()
  if (!booking) return { ok: false, error: 'Booking not found' }

  const r = row as SupplierRowForExpense
  const description = [r.supplier_name, r.service_description].filter(Boolean).join(' — ')
  const base = {
    tenant_id: tenantId,
    itinerary_id: booking.itinerary_id ?? null,
    booking_supplier_status_id: r.id,
    supplier_id: r.supplier_id,
    supplier_name: r.supplier_name,
    supplier_type: vocabularyTypeForSupplierType(r.supplier_type),
    category: expenseCategoryForSupplierType(r.supplier_type),
    description,
    amount: plan.amount,
    currency: booking.currency || 'EUR',
    expense_date: plan.expense_date,
    status: 'pending',
    payment_reference: r.confirmation_number || null,
    notes: `Created when ${r.supplier_name} was confirmed on booking ${booking.booking_number}.`,
  }
  const { data, error } = await insertWithUniqueRetry({
    generateRow: async () => ({
      ...base,
      expense_number: await nextDocumentNumber({ supabase: db, prefix: 'EXP', table: 'expenses', column: 'expense_number' }),
    }),
    insert: async (rowToInsert) => await db.from('expenses').insert([rowToInsert]).select(EXPENSE_COLUMNS).single(),
  })
  if (error) {
    // Two saves at once: the other one made it (unique on the row id).
    if (error.code === '23505' && String(error.message || '').includes('booking_supplier_status_id')) {
      const { data: theirs } = await db.from('expenses').select(EXPENSE_COLUMNS).eq('booking_supplier_status_id', rowId).maybeSingle()
      return { ok: true, action: 'none', expense: (theirs as LinkedExpense | null) ?? null }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, action: 'create', expense: data as LinkedExpense }
}
