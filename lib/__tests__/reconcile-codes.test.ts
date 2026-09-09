// Phase 4 reconciliation matcher: pairs the other install's coded suppliers to
// this install's existing suppliers on email/phone, and decides what to stamp.
import { describe, it, expect } from 'vitest'
import { planReconciliation, readIncomingRow, type ExistingSupplier } from '@/lib/suppliers/reconcile-codes'

const existing: ExistingSupplier[] = [
  { id: 'e1', company_name: 'Nile Cruises Ltd', email: 'ops@nile.example', phone: '+20 100 111 2222', supplier_code: null },
  { id: 'e2', company_name: 'Cairo Guides', email: 'hello@cairoguides.example', phone: '01234567890', supplier_code: null },
  { id: 'e3', company_name: 'Already Coded', email: 'a@coded.example', phone: null, supplier_code: 'SUP-0009' },
  { id: 'e4', company_name: 'Dup A', email: 'shared@x.example', phone: null, supplier_code: null },
  { id: 'e5', company_name: 'Dup B', email: 'shared@x.example', phone: null, supplier_code: null },
]

describe('planReconciliation', () => {
  it('stamps a code on a single email match', () => {
    const { rows } = planReconciliation([{ code: 'SUP-0001', name: 'Nile Cruises Co', email: 'OPS@nile.example' }], existing)
    expect(rows[0]).toMatchObject({ status: 'match', code: 'SUP-0001', supplier_id: 'e1', via: 'email' })
  })

  it('matches on phone when email differs, ignoring formatting/country prefix', () => {
    // Same last-9 digits as e1's "+20 100 111 2222".
    const { rows } = planReconciliation([{ code: 'SUP-0001', email: 'different@x.example', phone: '00201001112222' }], existing)
    expect(rows[0]).toMatchObject({ status: 'match', supplier_id: 'e1', via: 'phone' })
  })

  it('reports no_match when neither email nor phone hits', () => {
    const { rows } = planReconciliation([{ code: 'SUP-0002', email: 'nobody@x.example', phone: '999' }], existing)
    expect(rows[0].status).toBe('no_match')
  })

  it('reports ambiguous when two suppliers share the contact', () => {
    const { rows } = planReconciliation([{ code: 'SUP-0003', email: 'shared@x.example' }], existing)
    expect(rows[0]).toMatchObject({ status: 'ambiguous', code: 'SUP-0003' })
    expect((rows[0] as any).candidates.map((c: any) => c.id).sort()).toEqual(['e4', 'e5'])
  })

  it('says already when the matched supplier holds exactly this code', () => {
    const { rows } = planReconciliation([{ code: 'SUP-0009', email: 'a@coded.example' }], existing)
    expect(rows[0]).toMatchObject({ status: 'already', supplier_id: 'e3' })
  })

  it('flags a conflict when the matched supplier already has a different code', () => {
    const { rows } = planReconciliation([{ code: 'SUP-0001', email: 'a@coded.example' }], existing)
    expect(rows[0]).toMatchObject({ status: 'conflict', supplier_id: 'e3' })
    expect((rows[0] as any).reason).toMatch(/already has code/)
  })

  it('flags a conflict when the incoming code is already used by another supplier here', () => {
    const { rows } = planReconciliation([{ code: 'SUP-0009', email: 'ops@nile.example' }], existing)
    // e1 matches by email but SUP-0009 already belongs to e3.
    expect(rows[0]).toMatchObject({ status: 'conflict', supplier_id: 'e1' })
    expect((rows[0] as any).reason).toMatch(/already used by another supplier/)
  })

  it('summarises the plan', () => {
    const { summary } = planReconciliation(
      [
        { code: 'SUP-0001', email: 'ops@nile.example' }, // match
        { code: 'SUP-0009', email: 'a@coded.example' }, // already
        { code: 'SUP-0003', email: 'shared@x.example' }, // ambiguous
        { code: 'SUP-0007', email: 'nobody@x.example' }, // no_match
      ],
      existing,
    )
    expect(summary).toMatchObject({ total: 4, match: 1, already: 1, ambiguous: 1, no_match: 1, conflict: 0 })
  })

  it('skips rows with no code', () => {
    const { rows } = planReconciliation([{ code: '', email: 'ops@nile.example' }], existing)
    expect(rows).toHaveLength(0)
  })
})

describe('readIncomingRow — header tolerance', () => {
  it('reads the travel-ops export headers (Code/Name/Email/Phone/WhatsApp)', () => {
    const r = readIncomingRow({ Code: 'SUP-0001', Name: 'X Co', Email: 'x@y.z', Phone: '', WhatsApp: '0100' })
    expect(r).toEqual({ code: 'SUP-0001', name: 'X Co', email: 'x@y.z', phone: '0100' })
  })

  it('reads snake_case variants too', () => {
    const r = readIncomingRow({ supplier_code: 'SUP-9', contact_email: 'a@b.c', contact_phone: '123' })
    expect(r).toMatchObject({ code: 'SUP-9', email: 'a@b.c', phone: '123' })
  })
})
