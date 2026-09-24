import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'

// ============================================================================
// The AI routes name a service failure instead of blaming the input, dumping
// the SDK's raw JSON, or reporting success with defaults.
// (Background: lib/__tests__/anthropic-single-client.test.ts.)
// ============================================================================

const create = vi.fn()

vi.mock('@/lib/ai/anthropic-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/anthropic-client')>()
  return { ...actual, createMessageWithRetry: (params: unknown) => create(params) }
})

vi.mock('@/lib/supabase-server', () => ({
  requireAuth: async () => ({ error: null, status: 200, tenant_id: 't1', supabase: {}, user: { id: 'u1' } }),
}))

vi.mock('@/lib/embeddings', () => ({
  chunkText: () => [], embedBatch: async () => [], EMBEDDING_MODEL: 'x', toPgVector: () => '',
}))

const invalidKey = () =>
  new Anthropic.AuthenticationError(401, undefined, 'API key is invalid.', new Headers())

// Sonnet 5 shape: adaptive thinking is on by default, so a thinking block comes first.
const reply = (text: string) => ({
  content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text }],
  stop_reason: 'end_turn',
})

const req = (body: Record<string, unknown>) =>
  new Request('http://x', { method: 'POST', body: JSON.stringify(body) })

type Handler = (r: never) => Promise<Response>
const call = async (handler: Handler, body: Record<string, unknown>) => {
  const res = await handler(req(body) as never)
  return { status: res.status, json: await res.json() }
}

beforeEach(() => {
  create.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/ai/parse-whatsapp', async () => {
  const { POST } = await import('@/app/api/ai/parse-whatsapp/route')
  const conversation = 'Hi, we are 2 adults wanting 5 days in Cairo and Luxor in March.'
  // The route is hidden (404) unless switched on; these tests switch it on.
  beforeEach(() => { vi.stubEnv('PARSE_WHATSAPP_ENABLED', 'true') })
  afterEach(() => { vi.unstubAllEnvs() })

  it('is hidden unless PARSE_WHATSAPP_ENABLED=true, and never calls the AI', async () => {
    vi.stubEnv('PARSE_WHATSAPP_ENABLED', '')
    const { status } = await call(POST, { conversation })
    expect(status).toBe(404)
    expect(create).not.toHaveBeenCalled()
  })

  it('a rejected key is named', async () => {
    create.mockRejectedValue(invalidKey())
    const { json } = await call(POST, { conversation })
    expect(json.success).toBe(false)
    expect(json.error).toMatch(/authentication failed/i)
  })

  it('an unreadable reply is a failure, not success with invented defaults', async () => {
    create.mockResolvedValue(reply('I am not sure what you mean.'))
    const { status, json } = await call(POST, { conversation })
    expect(status).toBe(422)
    expect(json.success).toBe(false)
    expect(json.data).toBeUndefined()
  })

  it('a readable reply still succeeds', async () => {
    create.mockResolvedValue(reply(JSON.stringify({ client_name: 'Ana', num_adults: 2, cities: ['Cairo'] })))
    const { json } = await call(POST, { conversation })
    expect(json.success).toBe(true)
    expect(json.data.client_name).toBe('Ana')
  })
})

describe('POST /api/ai/parse-file', async () => {
  const { POST } = await import('@/app/api/ai/parse-file/route')
  const pdf = Buffer.from('%PDF-1.4 itinerary').toString('base64')

  it('a rejected key is named, not dumped as raw JSON', async () => {
    create.mockRejectedValue(invalidKey())
    const { json } = await call(POST, { file: pdf, filename: 'trip.pdf', mimeType: 'application/pdf' })
    expect(json.success).toBe(false)
    expect(json.error).toMatch(/authentication failed/i)
  })

  it('a PDF reply that starts with thinking still returns the extracted text', async () => {
    create.mockResolvedValue(reply('Day 1: Giza Pyramids\nDay 2: Egyptian Museum'))
    const { json } = await call(POST, { file: pdf, filename: 'trip.pdf', mimeType: 'application/pdf' })
    expect(json.success).toBe(true)
    expect(json.text).toMatch(/^Day 1: Giza/)
  })

  it('a legacy .doc is refused with what to do, and never sent to the AI as an image', async () => {
    const { status, json } = await call(POST, { file: pdf, filename: 'trip.doc', mimeType: 'application/msword' })
    expect(status).toBe(400)
    expect(json.error).toMatch(/\.docx or PDF/)
    expect(create).not.toHaveBeenCalled()
  })

  it('an unreadable .docx is a 422, with no AI call', async () => {
    const { status } = await call(POST, {
      file: Buffer.from('not a zip').toString('base64'),
      filename: 'trip.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    expect(status).toBe(422)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('POST /api/copilot/knowledge/bulk-import (ai_extract)', async () => {
  const { POST } = await import('@/app/api/copilot/knowledge/bulk-import/route')
  const text = 'Cancellation: full refund up to 30 days before departure. FAQ: is lunch included? Yes.'

  it('a rejected key is named', async () => {
    create.mockRejectedValue(invalidKey())
    const { json } = await call(POST, { text, mode: 'ai_extract' })
    expect(json.error).toMatch(/authentication failed/i)
    expect(json.error).not.toMatch(/"type":"error"/)
  })

  it('an unusable reply is still an extraction failure', async () => {
    create.mockResolvedValue(reply('not json'))
    const { status, json } = await call(POST, { text, mode: 'ai_extract' })
    expect(status).toBe(502)
    expect(json.error).toMatch(/^AI extraction failed/)
  })
})

// The pricing grid's upload panel was ported from travel-ops-pro, whose
// parse-file takes `files[]` and answers `data.raw_itinerary`. Ours reads one
// `file` and answers `text`, so every upload got "No file provided".
describe('pricing-grid upload panel speaks parse-file’s contract', () => {
  const panel = fs.readFileSync(
    path.resolve(__dirname, '../../../pricing-grid/components/InputPanel.tsx'),
    'utf8',
  )
  const route = fs.readFileSync(path.resolve(__dirname, '../parse-file/route.ts'), 'utf8')

  it('sends the fields the route destructures', () => {
    expect(route).toMatch(/const \{ file, filename, mimeType \} = body/)
    expect(panel).toMatch(/file: uploadedFile\.data/)
    expect(panel).toMatch(/filename: uploadedFile\.name/)
    expect(panel).toMatch(/mimeType: uploadedFile\.type/)
    expect(panel).not.toMatch(/files: \[/)
  })

  it('reads the field the route returns', () => {
    expect(route).toMatch(/text: extractedText\.trim\(\)/)
    expect(panel).toMatch(/extractData\.text/)
    expect(panel).not.toMatch(/extractData\.data\?\.raw_itinerary/)
  })
})
