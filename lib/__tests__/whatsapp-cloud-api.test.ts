import { describe, it, expect, vi, afterEach } from 'vitest'
import crypto from 'crypto'
import {
  formatMetaNumber,
  verifyMetaSignature,
  parseMetaWebhook,
  sendViaMeta,
  isMetaConfigured
} from '../whatsapp-cloud-api'
import { getWhatsAppProvider, sendWhatsAppMessage } from '../whatsapp'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// ============================================
// formatMetaNumber
// ============================================

describe('formatMetaNumber', () => {
  it('strips + and non-digits (Cloud API wants bare digits)', () => {
    expect(formatMetaNumber('+20 123 456 7890')).toBe('201234567890')
    expect(formatMetaNumber('whatsapp:+201234567890')).toBe('201234567890')
    expect(formatMetaNumber('20-123-456-7890')).toBe('201234567890')
  })

  it('rejects numbers that are too short', () => {
    expect(() => formatMetaNumber('+2012')).toThrow('too short')
  })
})

// ============================================
// verifyMetaSignature
// ============================================

describe('verifyMetaSignature', () => {
  const secret = 'test-app-secret'
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
  const sign = (payload: string, key: string) =>
    'sha256=' + crypto.createHmac('sha256', key).update(payload, 'utf8').digest('hex')

  it('accepts a valid signature', () => {
    expect(verifyMetaSignature(body, sign(body, secret), secret)).toBe(true)
  })

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyMetaSignature(body, sign(body, 'wrong-secret'), secret)).toBe(false)
  })

  it('rejects a signature over a different body (tampered payload)', () => {
    expect(verifyMetaSignature(body + 'x', sign(body, secret), secret)).toBe(false)
  })

  it('rejects missing or malformed headers', () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false)
    expect(verifyMetaSignature(body, 'sha1=abc', secret)).toBe(false)
    expect(verifyMetaSignature(body, 'garbage', secret)).toBe(false)
    expect(verifyMetaSignature(body, 'sha256=deadbeef', secret)).toBe(false)
  })
})

// ============================================
// parseMetaWebhook
// ============================================

function metaEnvelope(value: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA_ID', changes: [{ field: 'messages', value }] }]
  }
}

const baseMetadata = {
  display_phone_number: '15550001111',
  phone_number_id: 'PHONE_ID'
}

describe('parseMetaWebhook', () => {
  it('parses an inbound text message', () => {
    const { messages, statuses } = parseMetaWebhook(
      metaEnvelope({
        messaging_product: 'whatsapp',
        metadata: baseMetadata,
        contacts: [{ profile: { name: 'Ahmed' }, wa_id: '201234567890' }],
        messages: [
          {
            from: '201234567890',
            id: 'wamid.ABC123==',
            timestamp: '1722700000',
            type: 'text',
            text: { body: 'Hello, I want a quote' }
          }
        ]
      })
    )

    expect(statuses).toHaveLength(0)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      messageSid: 'wamid.ABC123==',
      from: '201234567890',
      to: '15550001111',
      body: 'Hello, I want a quote',
      profileName: 'Ahmed'
    })
    expect(messages[0].mediaId).toBeUndefined()
  })

  it('parses media messages with caption and mime type', () => {
    const { messages } = parseMetaWebhook(
      metaEnvelope({
        metadata: baseMetadata,
        messages: [
          {
            from: '201234567890',
            id: 'wamid.IMG==',
            type: 'image',
            image: { id: 'MEDIA_1', mime_type: 'image/jpeg', caption: 'our passports' }
          },
          {
            from: '201234567890',
            id: 'wamid.DOC==',
            type: 'document',
            document: { id: 'MEDIA_2', mime_type: 'application/pdf', filename: 'visa.pdf' }
          }
        ]
      })
    )

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      mediaId: 'MEDIA_1',
      mediaType: 'image/jpeg',
      body: 'our passports'
    })
    expect(messages[1]).toMatchObject({
      mediaId: 'MEDIA_2',
      mediaType: 'application/pdf',
      body: ''
    })
  })

  it('extracts button and interactive reply text', () => {
    const { messages } = parseMetaWebhook(
      metaEnvelope({
        metadata: baseMetadata,
        messages: [
          { from: '2012', id: 'wamid.BTN==', type: 'button', button: { text: 'Confirm booking' } },
          {
            from: '2012',
            id: 'wamid.INT==',
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 'x', title: 'Yes please' } }
          }
        ]
      })
    )
    expect(messages[0].body).toBe('Confirm booking')
    expect(messages[1].body).toBe('Yes please')
  })

  it('parses delivery statuses including failures', () => {
    const { messages, statuses } = parseMetaWebhook(
      metaEnvelope({
        metadata: baseMetadata,
        statuses: [
          { id: 'wamid.OK==', status: 'delivered', recipient_id: '201234567890', timestamp: '1' },
          {
            id: 'wamid.FAIL==',
            status: 'failed',
            recipient_id: '201234567890',
            errors: [{ code: 131047, title: 'Re-engagement message', message: 'More than 24 hours' }]
          }
        ]
      })
    )

    expect(messages).toHaveLength(0)
    expect(statuses).toHaveLength(2)
    expect(statuses[0]).toMatchObject({ messageSid: 'wamid.OK==', status: 'delivered' })
    expect(statuses[1]).toMatchObject({
      messageSid: 'wamid.FAIL==',
      status: 'failed',
      errorCode: '131047',
      errorMessage: 'More than 24 hours'
    })
  })

  it('handles empty, malformed, and non-message payloads without throwing', () => {
    expect(parseMetaWebhook(null)).toEqual({ messages: [], statuses: [] })
    expect(parseMetaWebhook({})).toEqual({ messages: [], statuses: [] })
    expect(parseMetaWebhook({ entry: [{ changes: [{ field: 'account_update', value: {} }] }] }))
      .toEqual({ messages: [], statuses: [] })
    // message without an id (can't dedup) is dropped
    const { messages } = parseMetaWebhook(
      metaEnvelope({ metadata: baseMetadata, messages: [{ from: '2012', type: 'text', text: { body: 'x' } }] })
    )
    expect(messages).toHaveLength(0)
  })
})

// ============================================
// sendViaMeta
// ============================================

function stubMetaEnv() {
  vi.stubEnv('META_WHATSAPP_ACCESS_TOKEN', 'test-token')
  vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '111222333')
}

describe('sendViaMeta', () => {
  it('fails cleanly when not configured', async () => {
    vi.stubEnv('META_WHATSAPP_ACCESS_TOKEN', '')
    vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '')
    const result = await sendViaMeta({ to: '+201234567890', body: 'hi' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('META_WHATSAPP_ACCESS_TOKEN')
  })

  it('sends a text message and returns the wamid', async () => {
    stubMetaEnv()
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ id: 'wamid.SENT==' }] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendViaMeta({ to: '+20 123 456 7890', body: 'hello' })

    expect(result).toEqual({ success: true, messageId: 'wamid.SENT==' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/111222333/messages')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    const payload = JSON.parse(init.body as string)
    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      to: '201234567890',
      type: 'text',
      text: { body: 'hello' }
    })
  })

  it('sends a PDF as a document with the body as caption', async () => {
    stubMetaEnv()
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ id: 'wamid.PDF==' }] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await sendViaMeta({
      to: '+201234567890',
      body: 'Your quote is attached',
      mediaUrl: 'https://storage.example.com/quotes/quote-42.pdf?token=abc'
    })

    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(payload.type).toBe('document')
    expect(payload.document).toMatchObject({
      link: 'https://storage.example.com/quotes/quote-42.pdf?token=abc',
      filename: 'quote-42.pdf',
      caption: 'Your quote is attached'
    })
  })

  it('sends an image URL as an image message', async () => {
    stubMetaEnv()
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ id: 'wamid.IMG==' }] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    await sendViaMeta({ to: '+201234567890', body: 'photo', mediaUrl: 'https://x.com/a.jpg' })

    const payload = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(payload.type).toBe('image')
    expect(payload.image).toMatchObject({ link: 'https://x.com/a.jpg', caption: 'photo' })
  })

  it('maps the 24-hour-window error (131047) to the same message as the Twilio path', async () => {
    stubMetaEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ error: { message: 'Re-engagement message', code: 131047 } }),
          { status: 400 }
        )
      )
    )

    const result = await sendViaMeta({ to: '+201234567890', body: 'hi' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('24-hour window')
  })

  it('surfaces other Graph API errors', async () => {
    stubMetaEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token', code: 190 } }), {
          status: 401
        })
      )
    )

    const result = await sendViaMeta({ to: '+201234567890', body: 'hi' })
    expect(result).toEqual({ success: false, error: 'Invalid OAuth access token' })
  })
})

// ============================================
// Provider dispatcher
// ============================================

describe('whatsapp provider dispatcher', () => {
  it('defaults to twilio when WHATSAPP_PROVIDER is unset or unknown', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', '')
    expect(getWhatsAppProvider()).toBe('twilio')
    vi.stubEnv('WHATSAPP_PROVIDER', 'something-else')
    expect(getWhatsAppProvider()).toBe('twilio')
  })

  it('selects meta only on the explicit opt-in', () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta')
    expect(getWhatsAppProvider()).toBe('meta')
    expect(isMetaConfigured()).toBe(false) // env not set in tests
  })

  it('routes sends to the Cloud API when WHATSAPP_PROVIDER=meta', async () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'meta')
    stubMetaEnv()
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [{ id: 'wamid.DISPATCH==' }] }), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendWhatsAppMessage({ to: '+201234567890', body: 'via dispatcher' })

    expect(result).toEqual({ success: true, messageId: 'wamid.DISPATCH==' })
    expect(String(fetchMock.mock.calls[0][0])).toContain('graph.facebook.com')
  })

  it('keeps the twilio path as-is when provider is twilio (fails on missing creds, no fetch)', async () => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'twilio')
    vi.stubEnv('TWILIO_ACCOUNT_SID', '')
    vi.stubEnv('TWILIO_API_KEY', '')
    vi.stubEnv('TWILIO_API_SECRET', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendWhatsAppMessage({ to: '+201234567890', body: 'hi' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Twilio')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
