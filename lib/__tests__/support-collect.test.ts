import { describe, it, expect } from 'vitest'
import { integrationState, integrationStates } from '../support/collect'

// A support check must not spend money or take seconds calling a vendor's API,
// so having the keys is reported as `configured` and nothing more. Only the
// database — which we must talk to anyway — is actually probed.

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv

describe('integrationState', () => {
  it('is configured only when every key it needs is set', () => {
    expect(integrationState(env({ A: 'x', B: 'y' }), 'A', 'B')).toBe('configured')
    expect(integrationState(env({ A: 'x' }), 'A', 'B')).toBe('unconfigured')
  })

  it('treats an empty value as unset — somebody meant to fill it in', () => {
    expect(integrationState(env({ A: '   ' }), 'A')).toBe('unconfigured')
  })
})

describe('integrationStates', () => {
  it('reports an unused integration as unconfigured, which is not a problem', () => {
    const states = integrationStates(env({}))
    expect(states.stripe).toBe('unconfigured')
    expect(states.anthropic).toBe('unconfigured')
  })

  it('accepts either WhatsApp provider', () => {
    expect(integrationStates(env({ TWILIO_ACCOUNT_SID: 'x' })).whatsapp).toBe('configured')
    expect(integrationStates(env({ META_WHATSAPP_ACCESS_TOKEN: 'x' })).whatsapp).toBe('configured')
    expect(integrationStates(env({})).whatsapp).toBe('unconfigured')
  })

  it('leaves supabase for the real probe rather than guessing from keys', () => {
    // Keys being present says nothing about whether the project answers.
    expect(integrationStates(env({ NEXT_PUBLIC_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' })).supabase)
      .toBe('unconfigured')
  })

  it('carries no VALUE into what it returns', () => {
    const states = integrationStates(env({ STRIPE_SECRET_KEY: 'sk_live_51H8xQ2abcdefghij' }))
    expect(JSON.stringify(states)).not.toContain('sk_live')
  })
})
