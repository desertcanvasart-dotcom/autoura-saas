import { describe, it, expect } from 'vitest'
import {
  decideTripNotifyOutcome,
  notifyTripMessage,
  type EmailAttempt,
} from '../trip-message-notify'
import type { PushResult } from '../push'

// P5: the notify-outcome model. The whole point is that every way of
// "nobody was told" maps to a DISTINCT, stored value — silence is
// diagnosable. The decision table is pure; the orchestrator is exercised
// with stubbed deps for the fallback order and the stamp.

const NO_EMAIL: EmailAttempt = { attempted: false, success: false }

describe('decideTripNotifyOutcome', () => {
  const cases: Array<[PushResult['outcome'], EmailAttempt, string]> = [
    ['sent', NO_EMAIL, 'push_sent'],
    ['no_subscriptions', { attempted: true, success: true }, 'email_sent'],
    ['not_configured', { attempted: true, success: true }, 'email_sent'],
    ['failed', { attempted: true, success: true }, 'email_sent'],
    ['not_configured', NO_EMAIL, 'not_configured'],
    ['no_subscriptions', NO_EMAIL, 'no_recipients'],
    ['failed', NO_EMAIL, 'failed'],
    ['no_subscriptions', { attempted: true, success: false }, 'failed'],
    // both channels are unconfigured — a setup problem, not a delivery one
    ['not_configured', { attempted: true, success: false, configError: true }, 'not_configured'],
  ]
  for (const [push, email, expected] of cases) {
    it(`push=${push} email=${JSON.stringify(email)} → ${expected}`, () => {
      expect(decideTripNotifyOutcome(push, email)).toBe(expected)
    })
  }
})

function makeDeps(opts: {
  push: PushResult['outcome']
  contactEmail?: string | null
  mailSuccess?: boolean
}) {
  const calls = { push: 0, mail: 0, stamps: [] as Record<string, unknown>[] }
  const deps = {
    push: async () => {
      calls.push++
      return { outcome: opts.push, delivered: opts.push === 'sent' ? 1 : 0 }
    },
    mail: async () => {
      calls.mail++
      return { success: opts.mailSuccess ?? true }
    },
    db: () => ({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === 'tenants' ? { contact_email: opts.contactEmail ?? null, company_name: 'T' } : null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            calls.stamps.push(patch)
            return { error: null }
          },
        }),
      }),
    }),
  }
  return { deps, calls }
}

const INPUT = {
  tenantId: 't1',
  itineraryId: 'i1',
  messageId: 'm1',
  senderName: 'Traveller',
  tripName: 'Jordan Classic',
  content: 'Where do we meet tomorrow?',
}

describe('notifyTripMessage', () => {
  it('push success: no email attempted, outcome stamped push_sent', async () => {
    const { deps, calls } = makeDeps({ push: 'sent' })
    const outcome = await notifyTripMessage(INPUT, deps as never)
    expect(outcome).toBe('push_sent')
    expect(calls.mail).toBe(0)
    expect(calls.stamps).toEqual([{ notify_outcome: 'push_sent' }])
  })

  it('push unusable → email fallback to the tenant contact', async () => {
    const { deps, calls } = makeDeps({ push: 'no_subscriptions', contactEmail: 'office@agency.com' })
    const outcome = await notifyTripMessage(INPUT, deps as never)
    expect(outcome).toBe('email_sent')
    expect(calls.mail).toBe(1)
    expect(calls.stamps).toEqual([{ notify_outcome: 'email_sent' }])
  })

  it('nothing reachable anywhere → no_recipients, still stamped', async () => {
    const { deps, calls } = makeDeps({ push: 'no_subscriptions', contactEmail: null })
    const outcome = await notifyTripMessage(INPUT, deps as never)
    expect(outcome).toBe('no_recipients')
    expect(calls.stamps).toEqual([{ notify_outcome: 'no_recipients' }])
  })

  it('never throws: a stamp rejection (migration 297 pending) is swallowed', async () => {
    const { deps } = makeDeps({ push: 'sent' })
    deps.db = () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        update: () => ({ eq: async () => ({ error: { message: 'column notify_outcome does not exist' } }) }),
      }),
    })
    await expect(notifyTripMessage(INPUT, deps as never)).resolves.toBe('push_sent')
  })
})
