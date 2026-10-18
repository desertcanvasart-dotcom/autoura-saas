import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { shouldApplySubscription, isLive } from '@/lib/billing/subscription-sync'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('a company row follows its live subscription', () => {
  it('the same subscription always applies', () => {
    expect(shouldApplySubscription({ stripe_subscription_id: 'sub_A', status: 'active' }, { id: 'sub_A', status: 'canceled' })).toBe(true)
  })
  it('an old subscription ending never overwrites a different live one', () => {
    expect(shouldApplySubscription({ stripe_subscription_id: 'sub_B', status: 'active' }, { id: 'sub_A', status: 'canceled' })).toBe(false)
  })
  it('a new live subscription replaces an ended one', () => {
    expect(shouldApplySubscription({ stripe_subscription_id: 'sub_A', status: 'canceled' }, { id: 'sub_B', status: 'trialing' })).toBe(true)
  })
  it('no row yet: anything applies', () => {
    expect(shouldApplySubscription(null, { id: 'sub_A', status: 'incomplete' })).toBe(true)
  })
  it('past_due and paused still count as on the go', () => {
    expect(isLive('past_due')).toBe(true)
    expect(isLive('paused')).toBe(true)
    expect(isLive('canceled')).toBe(false)
  })
})

describe('the Stripe webhook', () => {
  const src = read('app/api/billing/webhook/route.ts')
  it('syncs from the subscription as Stripe has it now', () => {
    expect(src).toContain('await stripe.subscriptions.retrieve(eventSubscription.id)')
  })
  it('throws (so Stripe retries) when the plan or the save fails', () => {
    expect(src).toContain('throw new Error(`No plan found for price ID')
    expect(src).toContain('throw new Error(`Could not save subscription')
  })
  it('never zeroes a period’s usage counters', () => {
    expect(src).toMatch(/onConflict: 'tenant_id,period_start',\s+ignoreDuplicates: true/)
  })
  it('a failed payment sets the real status, not a blanket past_due', () => {
    expect(src).not.toContain("status: 'past_due',")
    expect(src).toContain('status: current.status')
  })
  it('migration 428 lets the row be paused', () => {
    expect(read('supabase/migrations/428_subscription_status_paused.sql')).toContain("'incomplete_expired', 'paused'")
  })
})

describe('checkout', () => {
  const src = read('app/api/billing/create-checkout-session/route.ts')
  it('refuses a second subscription while one is on the go (incl. past_due)', () => {
    expect(src).toContain('if (existingSub && isLive(existingSub.status))')
  })
  it('the free trial is for the first subscription only', () => {
    expect(src).toContain('{ trial: !hadTrial }')
    expect(read('lib/stripe.ts')).toContain("payment_method_collection: trial ? 'if_required' : 'always'")
  })
})

describe('invoice payments (migration 429) in Postgres', () => {
  it('refuses an over-payment against the locked balance, allows refunds, and takes a key once', async () => {
    const db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE invoices (id uuid primary key, balance_due numeric);
      CREATE TABLE invoice_payments (id serial primary key, invoice_id uuid, amount numeric);
    `)
    await db.exec(readFileSync(join(process.cwd(), 'supabase/migrations/429_invoice_payments_serialised.sql'), 'utf8'))
    const inv = '11111111-1111-1111-1111-111111111111'
    await db.exec(`INSERT INTO invoices VALUES ('${inv}', 1000)`)
    const pay = (amount: number, key?: string) => db.query(
      `INSERT INTO invoice_payments (invoice_id, amount, idempotency_key) VALUES ($1, $2, $3)`, [inv, amount, key ?? null])
    await expect(pay(1000.01)).resolves.toBeTruthy() // within the 0.01 rounding allowance
    await expect(pay(1500)).rejects.toThrow(/exceeds balance/)
    await expect(pay(-50)).resolves.toBeTruthy()     // a refund is never capped
    await pay(10, 'k1')
    await expect(pay(10, 'k1')).rejects.toThrow(/duplicate|unique/i)
  }, 60_000)
})

describe('booking and extras', () => {
  it('booking payments reject an unknown type', () => {
    expect(read('app/api/bookings/[id]/payments/route.ts')).toContain("PAYMENT_TYPES.includes(String(payment_type))")
  })
  it('an invoice only claims extras still unbilled, and withdraws itself if it lost the race', () => {
    const src = read('app/api/invoices/route.ts')
    expect(src).toMatch(/\.is\('invoiced_at', null\)\s+\.select\('id'\)/)
    expect(src).toContain('(claimed ?? []).length < billedExtraIds.length')
  })
  it('payment forms send an idempotency key; the booking form cannot double submit', () => {
    expect(read('app/invoices/[id]/page.tsx')).toContain("'Idempotency-Key': paymentKeyRef.current")
    expect(read('app/payments/new/page.tsx')).toContain("'Idempotency-Key': paymentKeyRef.current")
    expect(read('app/bookings/[id]/page.tsx')).toContain("disabled={saving === 'payment'}")
  })
})

it('migration files are numbered without gaps from 423', () => {
  const nums = readdirSync(join(process.cwd(), 'supabase/migrations')).map(f => parseInt(f, 10)).filter(n => n >= 423).sort((a, b) => a - b)
  nums.forEach((n, i) => expect(n).toBe(423 + i))
})
