import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'

// ============================================================================
// A booking's payment status follows its money (migration 388). Before, only
// record_booking_payment() decided it, and wrongly: a refund left paid_full,
// a payment on a CANCELLED booking made it paid_full, a first payment not
// typed 'deposit' never confirmed, and extras / added travellers raised the
// total without touching the status. Runs the real migration on PGlite.
// ============================================================================

const T = '00000000-0000-0000-0000-000000000001'
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role authenticated; create role service_role;
    create table bookings(
      id uuid primary key default gen_random_uuid(), tenant_id uuid, currency text default 'EUR',
      status text default 'pending_deposit', total_amount numeric, total_paid numeric default 0,
      deposit_amount numeric, balance_due numeric, confirmation_date date, full_payment_date date,
      updated_at timestamptz);
    create table booking_payments(
      id uuid primary key default gen_random_uuid(), tenant_id uuid, booking_id uuid, payment_number text,
      amount numeric, currency text, payment_type text, payment_method text, payment_date date, status text,
      transaction_reference text, notes text, created_by uuid);`)
  await db.exec(fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/388_booking_status_follows_money.sql'), 'utf8'))
})

async function booking(total: number, deposit: number | null, status = 'pending_deposit') {
  const r = await db.query<{ id: string }>(
    `insert into bookings(tenant_id,total_amount,deposit_amount,status) values ($1,$2,$3,$4) returning id`,
    [T, total, deposit, status])
  return r.rows[0].id
}
async function pay(id: string, amount: number, type: string) {
  const r = await db.query<{ new_status: string; new_balance_due: string }>(
    `select * from record_booking_payment($1,$2,'P',$3,$4,'cash',current_date,null,null,null)`, [id, T, amount, type])
  return r.rows[0]
}
async function row(id: string) {
  return (await db.query<{ status: string; conf: boolean; full: boolean }>(
    `select status, confirmation_date is not null conf, full_payment_date is not null full from bookings where id=$1`, [id])).rows[0]
}

describe('booking payment status follows the money', () => {
  it('a payment reaching the deposit confirms — whatever it is typed', async () => {
    const b = await booking(1000, 300)
    expect((await pay(b, 300, 'installment')).new_status).toBe('confirmed')
    expect((await row(b)).conf).toBe(true)
  })
  it('below the deposit stays pending', async () => {
    const b = await booking(500, 150)
    expect((await pay(b, 100, 'deposit')).new_status).toBe('pending_deposit')
  })
  it('paying it all → paid_full, dated; a refund falls back to confirmed', async () => {
    const b = await booking(1000, 300)
    await pay(b, 300, 'deposit')
    expect((await pay(b, 700, 'balance')).new_status).toBe('paid_full')
    expect((await row(b)).full).toBe(true)
    expect((await pay(b, 200, 'refund')).new_status).toBe('confirmed')
  })
  it('an extra raising the total drops paid_full to confirmed (no RPC involved)', async () => {
    const b = await booking(1000, 300)
    await pay(b, 1000, 'full_payment')
    await db.query(`update bookings set total_amount = 1200 where id = $1`, [b])
    expect((await row(b)).status).toBe('confirmed')
  })
  it('never touches cancelled or in_progress', async () => {
    const c = await booking(500, 150, 'cancelled')
    expect((await pay(c, 500, 'full_payment')).new_status).toBe('cancelled')
    const p = await booking(500, 150, 'in_progress')
    expect((await pay(p, 500, 'full_payment')).new_status).toBe('in_progress')
  })
  it('no deposit set: any payment confirms', async () => {
    const b = await booking(500, null)
    expect((await pay(b, 50, 'installment')).new_status).toBe('confirmed')
  })
})

describe('approving extra travellers', () => {
  it('reads base_total_cost, so extras are not charged again to each new traveller', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/bookings/[id]/change-requests/[cid]/route.ts'), 'utf8')
    expect(src).toMatch(/\.select\('[^']*\bbase_total_cost\b[^']*'\)/)
    expect(src).toContain('oldBaseTotal: booking.base_total_cost')
  })
})
