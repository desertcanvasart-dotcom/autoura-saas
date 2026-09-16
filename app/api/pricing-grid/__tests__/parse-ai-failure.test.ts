import { describe, it, expect, vi, beforeEach } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'

// ============================================================================
// POST /api/pricing-grid/parse — a failed AI CALL is not a failed PARSE.
//
// Production, 2026-09-16: Anthropic rejected the API key (401). Both stages
// swallowed it, and the operator was told "Could not parse or generate
// itinerary from the provided text" — blaming their tour for a platform fault.
// Contract under test:
//   * a service error (401 here) is named, in both full and structure mode,
//     and never triggers the generative fallback
//   * a reply that is not usable JSON still falls back, and only then says
//     "could not parse"
// ============================================================================

const create = vi.fn()

vi.mock('@/lib/ai/anthropic-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/anthropic-client')>()
  return { ...actual, createMessageWithRetry: (params: unknown) => create(params) }
})

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, tenant_id: 't1', user: { id: 'u1' } }),
}))

// One entrance fee is enough to make the rate catalog non-empty.
vi.mock('@supabase/supabase-js', () => {
  const rows = (table: string) =>
    table === 'entrance_fees'
      ? [{ id: 'ent-1', attraction_name: 'Pyramids of Giza', city: 'Cairo', eur_rate: 20, non_eur_rate: 10 }]
      : []
  type Chain = { select: () => Chain; eq: () => Chain; then: Promise<unknown>['then'] }
  const chain = (table: string): Chain => {
    const result = Promise.resolve({ data: rows(table), error: null })
    const c: Chain = { select: () => c, eq: () => c, then: (res, rej) => result.then(res, rej) }
    return c
  }
  return { createClient: () => ({ from: chain }) }
})
vi.mock('@/lib/vocabulary-server', () => ({ loadVocabularyForTenant: async () => [] }))
vi.mock('@/lib/rates/run-currency', () => ({ getTenantRunCurrency: async () => 'EUR' }))
vi.mock('@/lib/rates/rate-currency', () => ({ normalizeRateRows: async (_db: unknown, _t: string, rows: unknown) => rows }))

const { POST } = await import('@/app/api/pricing-grid/parse/route')

const post = (body: Record<string, unknown>) =>
  POST(new Request('http://x/api/pricing-grid/parse', { method: 'POST', body: JSON.stringify(body) }) as unknown as Parameters<typeof POST>[0])

const invalidKey = () =>
  new Anthropic.AuthenticationError(
    401,
    { type: 'error', error: { type: 'authentication_error', message: 'API key is invalid.' } },
    'API key is invalid.',
    new Headers(),
  )

const reply = (text: string) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' })

const TEXT = 'Two days in Cairo, pyramids on day one, museum on day two.'

beforeEach(() => {
  create.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('pricing-grid parse — AI service failures are named', () => {
  it('full mode: a rejected key says authentication failed, and does not fall back', async () => {
    create.mockRejectedValue(invalidKey())
    const res = await post({ text: TEXT })
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toMatch(/authentication failed/i)
    expect(json.error).not.toMatch(/could not parse/i)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('structure mode: a rejected key says authentication failed', async () => {
    create.mockRejectedValue(invalidKey())
    const res = await post({ text: TEXT, mode: 'structure' })
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toMatch(/authentication failed/i)
  })

  it('full mode: unusable JSON still falls back, and only then says it could not parse', async () => {
    create.mockResolvedValue(reply('Sorry, I cannot help with that.'))
    const res = await post({ text: TEXT })
    const json = await res.json()
    expect(res.status).toBe(422)
    expect(json.error).toBe('Could not parse or generate itinerary from the provided text')
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('full mode: a good reply still parses into days', async () => {
    create.mockResolvedValue(reply(JSON.stringify({
      metadata: {},
      days: [{ dayNumber: 1, title: 'Giza', city: 'Cairo', slots: { entrance_fees: ['ent-1'] } }],
    })))
    const res = await post({ text: TEXT })
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.generationMode).toBe('parsed')
    expect(json.days).toHaveLength(1)
  })
})
