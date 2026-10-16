import { describe, it, expect, vi, beforeEach } from 'vitest'

// A failed Stripe event: state syncs are released for Stripe's retry; events
// that move money keep their claim for a person. Either way someone is told.

const h = vi.hoisted(() => ({
  event: null as null | { id: string; type: string; data: { object: unknown } },
  ops: [] as string[],
  alerts: 0,
}))

vi.mock('next/headers', () => ({ headers: async () => new Map([['stripe-signature', 'sig']]) }))
vi.mock('@/lib/stripe', () => ({ verifyWebhookSignature: () => h.event, stripe: {} }))
vi.mock('@/lib/monitoring/error-alerts', () => ({ reportServerError: async () => { h.alerts++ } }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const chain = () => q
      for (const m of ['select', 'eq', 'or', 'maybeSingle', 'single']) q[m] = chain
      q.insert = () => { h.ops.push(`insert:${table}`); return Promise.resolve({ error: null }) }
      q.delete = () => { h.ops.push(`delete:${table}`); return { eq: () => Promise.resolve({ error: null }) } }
      q.update = () => { h.ops.push(`update:${table}`); return { eq: () => Promise.resolve({ error: null }) } }
      // Any read the handler makes fails: the "passing database blip".
      q.then = (_ok: unknown, fail: (e: Error) => void) => fail(new Error('connection reset'))
      return q
    },
    rpc: async () => { throw new Error('connection reset') },
  }),
}))

import { POST } from '@/app/api/billing/webhook/route'

const call = () => POST(new Request('http://x/api/billing/webhook', { method: 'POST', body: '{}' }) as never)

beforeEach(() => {
  h.ops = []; h.alerts = 0
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a Stripe event that fails', () => {
  it('a state sync (checkout completed) releases its claim so Stripe retries it, and alerts', async () => {
    h.event = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { subscription: 'sub_1', customer: 'cus_1', metadata: { tenant_id: 't1' } } } }
    const res = await call()
    expect(res.status).toBe(500)
    expect(h.ops).toEqual(['insert:stripe_webhook_events', 'delete:stripe_webhook_events'])
    expect(h.alerts).toBe(1)
  })

  it('trial_will_end (raises a fee) keeps its claim for a person, and alerts', async () => {
    h.event = { id: 'evt_2', type: 'customer.subscription.trial_will_end', data: { object: { id: 'sub_2', customer: 'cus_2', metadata: { tenant_id: 't1' } } } }
    const res = await call()
    expect(res.status).toBe(500)
    expect(h.ops).toContain('update:stripe_webhook_events')
    expect(h.ops).not.toContain('delete:stripe_webhook_events')
    expect(h.alerts).toBe(1)
  })
})

describe('which events are safe to re-run', () => {
  it('never the ones that create or withdraw a charge at Stripe', async () => {
    const { isRetrySafeEvent } = await import('@/lib/billing/webhook-retry')
    expect(isRetrySafeEvent('customer.subscription.trial_will_end')).toBe(false)
    expect(isRetrySafeEvent('customer.subscription.deleted')).toBe(false)
    expect(isRetrySafeEvent('customer.subscription.updated')).toBe(true)
    expect(isRetrySafeEvent('invoice.paid')).toBe(true)
  })
})
