// Ported from travel-ops-pro, adapted to this app's booking columns:
// total_amount, and total_paid as the RPC-maintained ledger figure (no
// booking_payments summing, no payment_status / deposit_paid).
import { describe, it, expect, beforeEach } from 'vitest'
import { setMockTables, createMockClient } from './_mock-supabase'
import { recomputeBookingExtras } from '@/app/api/bookings/[id]/extras/recompute'

const TENANT = 'tenant-1'
const BOOKING = 'bk-1'

const booking = (over: Record<string, unknown> = {}) => ({
  id: BOOKING, tenant_id: TENANT, currency: 'EUR',
  total_amount: 5000, base_total_cost: null, extras_total: null,
  deposit_percent: 20, deposit_amount: 1000, total_paid: 0, balance_due: 5000,
  ...over,
})
const extra = (over: Record<string, unknown> = {}) => ({
  id: 'x-1', tenant_id: TENANT, booking_id: BOOKING, title: 'Extra day at Abu Simbel',
  quantity: 1, unit_price: 340, currency: 'EUR', status: 'confirmed', ...over,
})

let client: ReturnType<typeof createMockClient>
const read = async () => {
  const { data } = await client.from('bookings').select('*').eq('id', BOOKING).maybeSingle()
  return data as Record<string, number | string | boolean | null>
}
beforeEach(() => { client = createMockClient() })

describe('recomputeBookingExtras', () => {
  it('adds a confirmed extra to the total and leaves the deposit alone', async () => {
    setMockTables({ bookings: [booking()], booking_extras: [extra()] })
    const r = await recomputeBookingExtras(client, BOOKING, TENANT)
    expect(r.ok).toBe(true)
    const after = await read()
    expect(after.base_total_cost).toBe(5000)
    expect(after.extras_total).toBe(340)
    expect(after.total_amount).toBe(5340)
    expect(after.deposit_amount).toBe(1000) // 20% of the base, unchanged
    expect(after.balance_due).toBe(5340)
  })

  it('ignores everything that is not confirmed', async () => {
    setMockTables({ bookings: [booking()], booking_extras: [
      extra({ id: 'a', status: 'offered', unit_price: 900 }),
      extra({ id: 'b', status: 'accepted', unit_price: 900 }),
      extra({ id: 'c', status: 'requested', unit_price: null }),
    ] })
    await recomputeBookingExtras(client, BOOKING, TENANT)
    const after = await read()
    expect(after.total_amount).toBe(5000); expect(after.extras_total).toBe(0)
  })

  it('takes the money back out when the extra is withdrawn', async () => {
    setMockTables({ bookings: [booking()], booking_extras: [extra()] })
    await recomputeBookingExtras(client, BOOKING, TENANT)
    expect((await read()).total_amount).toBe(5340)
    await client.from('booking_extras').update({ status: 'withdrawn' }).eq('id', 'x-1')
    await recomputeBookingExtras(client, BOOKING, TENANT)
    const after = await read()
    expect(after.total_amount).toBe(5000); expect(after.extras_total).toBe(0)
    expect(after.base_total_cost).toBe(5000) // the agreed price, never lost
  })

  it('does not compound when it runs twice', async () => {
    setMockTables({ bookings: [booking()], booking_extras: [extra()] })
    await recomputeBookingExtras(client, BOOKING, TENANT)
    const once = await read()
    await recomputeBookingExtras(client, BOOKING, TENANT)
    expect(await read()).toEqual(once)
  })

  it('reopens the balance on a booking that had been paid in full', async () => {
    // The customer paid everything (total_paid kept by the RPC), then bought
    // an extra. They owe again — exactly the extra.
    setMockTables({ bookings: [booking({ total_paid: 5000, balance_due: 0 })], booking_extras: [extra()] })
    await recomputeBookingExtras(client, BOOKING, TENANT)
    const after = await read()
    expect(after.total_amount).toBe(5340); expect(after.balance_due).toBe(340)
  })

  it('uses the ledger figure the RPC keeps, refunds already netted', async () => {
    setMockTables({ bookings: [booking({ total_paid: 1500 })], booking_extras: [extra()] })
    await recomputeBookingExtras(client, BOOKING, TENANT)
    expect((await read()).balance_due).toBe(3840) // 5340 - 1500
  })

  it('leaves a foreign-currency extra out of the total instead of converting it', async () => {
    setMockTables({ bookings: [booking()], booking_extras: [
      extra({ id: 'eur', unit_price: 340, currency: 'EUR' }),
      extra({ id: 'jpy', title: 'Insurance-style cover', unit_price: 12200, currency: 'JPY' }),
    ] })
    const r = await recomputeBookingExtras(client, BOOKING, TENANT)
    expect(r.ok && r.excluded.map(e => e.id)).toEqual(['jpy'])
    expect((await read()).total_amount).toBe(5340)
  })

  it('refuses, and writes nothing, when a confirmed extra has no price', async () => {
    setMockTables({ bookings: [booking()], booking_extras: [extra({ title: 'Balloon ride', unit_price: null })] })
    const r = await recomputeBookingExtras(client, BOOKING, TENANT)
    expect(r.ok).toBe(false); expect(!r.ok && r.status).toBe(409); expect(!r.ok && r.error).toMatch(/Balloon ride/)
    expect((await read()).total_amount).toBe(5000)
  })

  it('fails closed when the migration has not been applied', async () => {
    const noColumns = booking()
    delete (noColumns as Record<string, unknown>).base_total_cost
    delete (noColumns as Record<string, unknown>).extras_total
    setMockTables({ bookings: [noColumns], booking_extras: [extra()] })
    const r = await recomputeBookingExtras(client, BOOKING, TENANT)
    expect(r.ok).toBe(false); expect(!r.ok && r.status).toBe(503)
    expect((await read()).total_amount).toBe(5000)
  })

  it('will not touch a booking belonging to another tenant', async () => {
    setMockTables({ bookings: [booking()], booking_extras: [extra()] })
    const r = await recomputeBookingExtras(client, BOOKING, 'someone-else')
    expect(r.ok).toBe(false); expect(!r.ok && r.status).toBe(404)
  })
})
