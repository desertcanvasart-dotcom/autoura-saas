import { describe, it, expect, vi, beforeEach } from 'vitest'

// Paying a supplier invoice pays the expenses matched to it. Every report
// (Payables, P&L, cash flow) reads expenses, so before this the costs a paid
// bill covered stayed "owed" in Payables and never counted as money out.

type Row = Record<string, unknown>
let db: Record<string, Row[]>

function from(table: string) {
  let patch: Row | null = null
  const filters: Array<(r: Row) => boolean> = []
  const run = () => {
    const rows = (db[table] || []).filter(r => filters.every(f => f(r)))
    if (patch) rows.forEach(r => Object.assign(r, patch))
    return { data: rows.map(r => ({ ...r })), error: null }
  }
  const q = {
    select: () => q,
    update: (p: Row) => ((patch = p), q),
    eq: (c: string, v: unknown) => (filters.push(r => r[c] === v), q),
    in: (c: string, vs: unknown[]) => (filters.push(r => vs.includes(r[c])), q),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: <T>(res: (r: ReturnType<typeof run>) => T, rej?: (e: unknown) => T) => Promise.resolve(run()).then(res, rej),
  }
  return q
}

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', user: { id: 'u1' }, supabase: { from } }),
}))

const { POST } = await import('@/app/api/supplier-invoices/[id]/pay/route')
const pay = async (body: Row = {}) => {
  const res = await POST({ json: async () => body } as never, { params: Promise.resolve({ id: 'si1' }) })
  return { status: res.status, body: await res.json() }
}
const expense = (id: string) => db.expenses.find(e => e.id === id)!

beforeEach(() => {
  db = {
    supplier_invoices: [{ id: 'si1', status: 'approved', supplier_invoice_number: 'H-1042', payment_method: null, payment_reference: null }],
    supplier_invoice_expenses: [
      { supplier_invoice_id: 'si1', expense_id: 'e1' },
      { supplier_invoice_id: 'si1', expense_id: 'e2' },
      { supplier_invoice_id: 'si1', expense_id: 'e3' },
      { supplier_invoice_id: 'si1', expense_id: 'e4' },
    ],
    expenses: [
      { id: 'e1', status: 'pending' },
      { id: 'e2', status: 'approved' },
      { id: 'e3', status: 'rejected' },
      { id: 'e4', status: 'paid', payment_date: '2026-01-02', payment_reference: 'earlier' },
      { id: 'e5', status: 'pending' }, // not matched to this bill
    ],
  }
})

describe('POST /api/supplier-invoices/[id]/pay', () => {
  it('marks the matched pending/approved expenses paid with the invoice', async () => {
    const { status, body } = await pay({ payment_method: 'bank_transfer', payment_reference: 'TRX-9' })
    expect(status).toBe(200)
    expect(body.expenses_paid).toBe(2)
    for (const id of ['e1', 'e2']) {
      expect(expense(id)).toMatchObject({ status: 'paid', payment_method: 'bank_transfer', payment_reference: 'TRX-9' })
      expect(expense(id).payment_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('leaves rejected, already-paid and unmatched expenses alone', async () => {
    await pay()
    expect(expense('e3').status).toBe('rejected')
    expect(expense('e4')).toMatchObject({ payment_date: '2026-01-02', payment_reference: 'earlier' })
    expect(expense('e5').status).toBe('pending')
  })

  it("references the supplier's invoice number when no payment reference is given", async () => {
    await pay()
    expect(expense('e1').payment_reference).toBe('Supplier invoice H-1042')
  })

  it('touches no expense when the invoice is not approved', async () => {
    db.supplier_invoices[0].status = 'matched'
    expect((await pay()).status).toBe(409)
    expect(expense('e1').status).toBe('pending')
  })
})
