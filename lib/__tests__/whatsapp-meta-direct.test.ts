import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

// ============================================================================
// Sending through Meta directly, one number per company
// ============================================================================
// On Meta the app sent every company's messages from one phone number ID.
// Each company's own number (tenants.whatsapp_number) is now looked up in the
// WhatsApp account for its ID; long texts are split instead of refused; a long
// caption goes as its own message.

const ownNumber: { value: string | null } = { value: null }
vi.mock('@/lib/supabase-server', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { whatsapp_number: ownNumber.value, operating_country: 'EG' }, error: null }) }),
      }),
    }),
  }),
}))
vi.mock('@/lib/whatsapp-outbound', () => ({ recordOutboundWhatsApp: vi.fn(async () => undefined) }))

import { splitWhatsAppText, META_TEXT_LIMIT, TWILIO_TEXT_LIMIT } from '../whatsapp-split'
import { listMetaPhoneNumbers, metaPhoneNumberIdFor, checkMetaSender, clearMetaNumberCache, metaBusinessAccountIds } from '../whatsapp-meta-numbers'
import { sendViaMeta, META_CAPTION_LIMIT, isMetaConfigured } from '../whatsapp-cloud-api'
import { sendWhatsAppMessage } from '../whatsapp'

const PHONE_LIST = {
  data: [
    { id: '900001', display_phone_number: '+20 15 0304 0468', verified_name: 'GetAutoura', status: 'CONNECTED' },
    { id: '900002', display_phone_number: '+20 15 5177 2258', verified_name: 'Travel2Egypt', status: 'PENDING' },
  ],
}

type Call = { url: string; body: Record<string, unknown> | null }

function stubGraph(): Call[] {
  const calls: Call[] = []
  let n = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null })
    if (url.includes('/phone_numbers')) return new Response(JSON.stringify(PHONE_LIST), { status: 200 })
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${++n}` }] }), { status: 200 })
  }))
  return calls
}

function stubMeta() {
  vi.stubEnv('WHATSAPP_PROVIDER', 'meta')
  vi.stubEnv('META_WHATSAPP_ACCESS_TOKEN', 'test-token')
  vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '111222333')
  vi.stubEnv('META_WHATSAPP_BUSINESS_ACCOUNT_ID', '1450439080513235')
}

beforeEach(() => {
  clearMetaNumberCache()
  ownNumber.value = null
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('splitting a long message', () => {
  it('leaves a message within the limit alone, and an empty one empty', () => {
    expect(splitWhatsAppText('hello', 1600)).toEqual(['hello'])
    expect(splitWhatsAppText('   ', 1600)).toEqual([])
  })

  it('cuts at paragraph breaks, every part within the limit, nothing lost', () => {
    const para = (c: string) => (c + ' ').repeat(300).trim() // 599 chars
    const text = [para('a'), para('b'), para('c'), para('d')].join('\n\n')
    const parts = splitWhatsAppText(text, TWILIO_TEXT_LIMIT)
    expect(parts.length).toBe(2)
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(TWILIO_TEXT_LIMIT)
    expect(parts[0].endsWith('b')).toBe(true)
    expect(parts.join('\n\n')).toBe(text)
  })

  it('falls back to sentence ends, then spaces — never mid-word', () => {
    const text = 'Day one is the pyramids. '.repeat(100).trim()
    const parts = splitWhatsAppText(text, 600)
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(600)
      expect(p.endsWith('.')).toBe(true)
    }
    expect(parts.join(' ')).toBe(text)
  })

  it('cuts a single unbroken run at the limit', () => {
    const parts = splitWhatsAppText('x'.repeat(5000), META_TEXT_LIMIT)
    expect(parts.map(p => p.length)).toEqual([4096, 904])
  })
})

describe('each company’s Meta number', () => {
  it('reads the WhatsApp account IDs, comma-separated', () => {
    vi.stubEnv('META_WHATSAPP_BUSINESS_ACCOUNT_ID', '111, 222 nope')
    expect(metaBusinessAccountIds()).toEqual(['111', '222'])
  })

  it('lists the account’s numbers with their IDs, in E.164', async () => {
    stubMeta(); stubGraph()
    const numbers = await listMetaPhoneNumbers()
    expect(numbers.map(n => [n.id, n.number, n.status])).toEqual([
      ['900001', '+201503040468', 'CONNECTED'],
      ['900002', '+201551772258', 'PENDING'],
    ])
  })

  it('finds the ID for a company’s number however it was typed; none for an unknown or blank number', async () => {
    stubMeta(); stubGraph()
    expect(await metaPhoneNumberIdFor('+20 155 177 2258')).toBe('900002')
    expect(await metaPhoneNumberIdFor('+201000000000')).toBeNull()
    expect(await metaPhoneNumberIdFor(null)).toBeNull()
  })

  it('a failed lookup is no ID (the shared number), not a failed send', async () => {
    stubMeta()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 })))
    expect(await metaPhoneNumberIdFor('+201503040468')).toBeNull()
  })

  it('Super Admin’s check: in the account and connected, else refused saying why', async () => {
    stubMeta(); stubGraph()
    expect(await checkMetaSender('+201503040468')).toEqual({ ok: true, status: 'CONNECTED' })
    expect(await checkMetaSender('+201551772258')).toMatchObject({ ok: false, reason: 'not_online' })
    expect(await checkMetaSender('+201000000000')).toMatchObject({ ok: false, reason: 'not_found' })
  })

  it('Meta counts as set up with the account ID alone (every company has its own number)', () => {
    vi.stubEnv('META_WHATSAPP_ACCESS_TOKEN', 't')
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '')
    vi.stubEnv('META_WHATSAPP_BUSINESS_ACCOUNT_ID', '123')
    expect(isMetaConfigured()).toBe(true)
  })
})

describe('sending through Meta', () => {
  it('a company with its own number sends from that number’s ID', async () => {
    stubMeta(); const calls = stubGraph()
    ownNumber.value = '+201551772258'
    const r = await sendViaMeta({ to: '+201234567890', body: 'hi', tenantId: 't2e' })
    expect(r.success).toBe(true)
    expect(calls.at(-1)!.url).toContain('/900002/messages')
  })

  it('a company without one sends from the shared ID', async () => {
    stubMeta(); const calls = stubGraph()
    const r = await sendViaMeta({ to: '+201234567890', body: 'hi', tenantId: 'other' })
    expect(r.success).toBe(true)
    expect(calls.at(-1)!.url).toContain('/111222333/messages')
  })

  it('a caption over Meta’s limit: the file goes bare, the words follow as a text', async () => {
    stubMeta(); const calls = stubGraph()
    const long = 'y'.repeat(META_CAPTION_LIMIT + 10)
    const r = await sendViaMeta({ to: '+201234567890', body: long, mediaUrl: 'https://x.test/quote.pdf', tenantId: null })
    expect(r.success).toBe(true)
    const sends = calls.filter(c => c.url.endsWith('/messages'))
    expect(sends[0].body).toMatchObject({ type: 'document' })
    expect((sends[0].body!.document as Record<string, unknown>).caption).toBeUndefined()
    expect(sends[1].body).toMatchObject({ type: 'text', text: { body: long } })
  })

  it('a text over 4,096 characters goes as several messages, in order', async () => {
    stubMeta(); const calls = stubGraph()
    const text = ('Paragraph. '.repeat(300) + '\n\n').repeat(2).trim()
    const r = await sendWhatsAppMessage({ to: '+201234567890', body: text, tenantId: null })
    expect(r.success).toBe(true)
    expect(r.warning).toMatch(/^Sent as \d messages/)
    const sends = calls.filter(c => c.url.endsWith('/messages'))
    expect(sends.length).toBeGreaterThan(1)
    for (const s of sends) expect(((s.body!.text as Record<string, string>).body).length).toBeLessThanOrEqual(META_TEXT_LIMIT)
  })
})
