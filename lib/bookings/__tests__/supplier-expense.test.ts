import { describe, it, expect, vi, beforeEach } from 'vitest'

// Confirming a supplier on a booking records what the trip owes them as a
// pending expense; it follows the row until someone approves/pays/rejects it.

vi.mock('@/lib/document-numbering', () => ({
  nextDocumentNumber: async () => `EXP-2026-${String(++seq).padStart(3, '0')}`,
  insertWithUniqueRetry: async (o: { generateRow: () => Promise<unknown>; insert: (r: unknown) => Promise<unknown> }) => o.insert(await o.generateRow()),
}))
let seq = 0

const {
  planSupplierExpense, supplierRowCost, expenseCategoryForSupplierType, vocabularyTypeForSupplierType, syncSupplierExpense,
} = await import('@/lib/bookings/supplier-expense')

type Row = Record<string, unknown>
let db: Record<string, Row[]>

function from(table: string) {
  let op: 'select' | 'update' | 'delete' | 'insert' = 'select'
  let patch: Row | null = null
  let inserted: Row[] = []
  const filters: Array<(r: Row) => boolean> = []
  const rows = () => (db[table] ||= [])
  const run = () => {
    if (op === 'insert') {
      inserted.forEach(r => rows().push({ id: `x${rows().length + 1}`, ...r }))
      return { data: inserted.map(r => ({ ...rows().find(x => x.booking_supplier_status_id === r.booking_supplier_status_id) })), error: null }
    }
    const hit = rows().filter(r => filters.every(f => f(r)))
    if (op === 'update') hit.forEach(r => Object.assign(r, patch))
    if (op === 'delete') db[table] = rows().filter(r => !hit.includes(r))
    return { data: hit.map(r => ({ ...r })), error: null }
  }
  const q = {
    select: () => q,
    update: (p: Row) => ((op = 'update'), (patch = p), q),
    delete: () => ((op = 'delete'), q),
    insert: (rs: Row[]) => ((op = 'insert'), (inserted = rs), q),
    eq: (c: string, v: unknown) => (filters.push(r => r[c] === v), q),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    single: async () => ({ data: run().data[0] ?? null, error: null }),
    then: <T>(res: (r: { data: Row[]; error: null }) => T) => Promise.resolve(run()).then(res),
  }
  return q
}
const client = { from } as never
const supplierRow = () => db.booking_supplier_status[0]
const expenses = () => db.expenses || []

beforeEach(() => {
  seq = 0
  db = {
    bookings: [{ id: 'b1', booking_number: 'BK-2026-0003', itinerary_id: 'it1', currency: 'USD' }],
    booking_supplier_status: [{
      id: 's1', booking_id: 'b1', supplier_id: 'sup1', supplier_type: 'restaurant', supplier_name: 'Sofra',
      service_description: 'Lunch', service_date: '2026-11-03', quoted_cost: 120, confirmed_cost: null,
      confirmation_number: 'C-77', status: 'pending',
    }],
    expenses: [],
  }
})

describe('planSupplierExpense', () => {
  const today = '2026-10-05'
  it('creates on confirmation, with the service date', () => {
    expect(planSupplierExpense({ status: 'confirmed', confirmed_cost: null, quoted_cost: 50, service_date: '2026-11-01' }, null, today))
      .toEqual({ action: 'create', amount: 50, expense_date: '2026-11-01' })
  })
  it('does nothing before confirmation or without a cost', () => {
    expect(planSupplierExpense({ status: 'contacted', confirmed_cost: null, quoted_cost: 50, service_date: null }, null, today).action).toBe('none')
    expect(planSupplierExpense({ status: 'confirmed', confirmed_cost: null, quoted_cost: null, service_date: null }, null, today).action).toBe('none')
  })
  it('never touches an expense someone approved, paid or rejected', () => {
    for (const status of ['approved', 'paid', 'rejected']) {
      expect(planSupplierExpense({ status: 'cancelled', confirmed_cost: null, quoted_cost: 50, service_date: null }, { status, amount: 50, expense_date: today }, today).action).toBe('kept')
    }
  })
})

describe('helpers', () => {
  it('prefers the confirmed cost', () => {
    expect(supplierRowCost({ confirmed_cost: '95.5', quoted_cost: 120 })).toBe(95.5)
    expect(supplierRowCost({ confirmed_cost: null, quoted_cost: 120 })).toBe(120)
    expect(supplierRowCost({ confirmed_cost: 0, quoted_cost: 0 })).toBeNull()
  })
  it('maps supplier types to expense categories and vocabulary keys', () => {
    expect(expenseCategoryForSupplierType('restaurant')).toBe('meal')
    expect(expenseCategoryForSupplierType('transport')).toBe('transportation')
    expect(expenseCategoryForSupplierType('flight')).toBe('flights')
    expect(expenseCategoryForSupplierType('mystery')).toBe('other')
    expect(vocabularyTypeForSupplierType('transport')).toBe('transport_company')
    expect(vocabularyTypeForSupplierType('hotel')).toBe('hotel')
  })
})

describe('syncSupplierExpense', () => {
  it('confirming records one pending expense for the trip', async () => {
    supplierRow().status = 'confirmed'
    const r = await syncSupplierExpense(client, 't1', 's1')
    expect(r).toMatchObject({ ok: true, action: 'create' })
    expect(expenses()).toHaveLength(1)
    expect(expenses()[0]).toMatchObject({
      tenant_id: 't1', itinerary_id: 'it1', booking_supplier_status_id: 's1', supplier_id: 'sup1',
      supplier_name: 'Sofra', supplier_type: 'restaurant', category: 'meal', amount: 120, currency: 'USD',
      expense_date: '2026-11-03', status: 'pending', payment_reference: 'C-77', expense_number: 'EXP-2026-001',
    })
    // saving again makes no second copy
    expect((await syncSupplierExpense(client, 't1', 's1'))).toMatchObject({ ok: true, action: 'none' })
    expect(expenses()).toHaveLength(1)
  })

  it('a new confirmed cost updates the pending expense', async () => {
    supplierRow().status = 'confirmed'
    await syncSupplierExpense(client, 't1', 's1')
    supplierRow().confirmed_cost = 99
    expect(await syncSupplierExpense(client, 't1', 's1')).toMatchObject({ ok: true, action: 'update' })
    expect(expenses()[0].amount).toBe(99)
  })

  it('un-confirming removes the pending expense', async () => {
    supplierRow().status = 'confirmed'
    await syncSupplierExpense(client, 't1', 's1')
    supplierRow().status = 'cancelled'
    expect(await syncSupplierExpense(client, 't1', 's1')).toMatchObject({ ok: true, action: 'remove' })
    expect(expenses()).toHaveLength(0)
  })

  it('leaves a paid expense alone when the supplier is cancelled', async () => {
    supplierRow().status = 'confirmed'
    await syncSupplierExpense(client, 't1', 's1')
    expenses()[0].status = 'paid'
    supplierRow().status = 'cancelled'
    expect(await syncSupplierExpense(client, 't1', 's1')).toMatchObject({ ok: true, action: 'kept' })
    expect(expenses()).toHaveLength(1)
  })
})
