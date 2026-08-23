import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Twilio status callback — the failure must be visible in the LOG, because it
// cannot be visible in the status code.
//
// The route must answer 200 whatever happens: a non-2xx makes Twilio retry the
// callback for hours. That is exactly what made the original bug invisible —
// the update result was read with `.single()`, so "no row with this SID"
// arrived as PGRST116 and was logged with the same words as a database
// outage, then swallowed. Every delivery status could have stopped recording
// without one distinguishable line.
//
// So the contract under test is: 200 always, and each distinct failure gets
// its own greppable marker.
// ============================================================================

process.env.TWILIO_AUTH_TOKEN = 'test-token'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

// The update chain's terminal `.select('id')` resolves to whatever the current
// scenario sets.
let updateResult: { data: unknown; error: unknown } = { data: [{ id: 'm1' }], error: null }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({ select: async () => updateResult }),
      }),
    }),
  }),
}))

vi.mock('twilio', () => ({
  default: { validateRequest: () => true },
  validateRequest: () => true,
}))

import { POST } from '@/app/api/whatsapp/status-callback/route'

function callback() {
  const body = new FormData()
  body.set('MessageSid', 'SM-does-not-exist')
  body.set('MessageStatus', 'delivered')
  body.set('To', 'whatsapp:+100')
  body.set('From', 'whatsapp:+200')
  return new Request('https://app.test/api/whatsapp/status-callback', {
    method: 'POST',
    headers: { 'x-twilio-signature': 'sig' },
    body,
  }) as never
}

let errors: string[]
beforeEach(() => {
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  })
})
afterEach(() => vi.restoreAllMocks())

describe('whatsapp status callback', () => {
  it('records the status and stays quiet when a row matches', async () => {
    updateResult = { data: [{ id: 'm1' }], error: null }
    const res = await POST(callback())
    expect(res.status).toBe(200)
    expect(errors.join('\n')).not.toMatch(/NO_MATCHING_MESSAGE|DB_ERROR/)
  })

  it('reports a distinct marker when no row carries the SID', async () => {
    updateResult = { data: [], error: null }
    const res = await POST(callback())
    expect(res.status).toBe(200) // Twilio must not retry
    expect(errors.join('\n')).toMatch(/NO_MATCHING_MESSAGE/)
    expect(errors.join('\n')).not.toMatch(/DB_ERROR/)
  })

  it('reports a different marker when the database itself fails', async () => {
    updateResult = { data: null, error: { code: '08006', message: 'connection failure' } }
    const res = await POST(callback())
    expect(res.status).toBe(200)
    expect(errors.join('\n')).toMatch(/DB_ERROR/)
    expect(errors.join('\n')).not.toMatch(/NO_MATCHING_MESSAGE/)
  })

  it('rejects an unsigned request before touching the database', async () => {
    const body = new FormData()
    body.set('MessageSid', 'SM1')
    const res = await POST(
      new Request('https://app.test/api/whatsapp/status-callback', {
        method: 'POST',
        body,
      }) as never
    )
    expect(res.status).toBe(403)
  })
})
