import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// The invoice email path was dead for months: Gmail app-password auth failed
// and the failure surfaced nowhere useful. These tests pin the two things that
// matter after the move to Resend —
//
//   1. a CONFIG problem is reported as one (authError), never swallowed
//   2. attachments and reply-to survive the transport swap
//
// A reminder that silently does not send is worse than one that fails loudly.
// ============================================================================

const send = vi.fn()
vi.mock('resend', () => ({
  Resend: class {
    emails = { send }
  },
}))

const { sendMail, bareAddress } = await import('@/lib/email-send')

const ORIGINAL = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY = 're_test_key'
  process.env.RESEND_FROM_EMAIL = 'Autoura <notifications@autoura.net>'
  send.mockResolvedValue({ data: { id: 'msg_1' }, error: null })
})

afterEach(() => {
  process.env = { ...ORIGINAL }
})

const basic = { to: 'client@example.com', subject: 'Invoice INV-1', html: '<p>due</p>' }

describe('configuration failures are reported, not swallowed', () => {
  it('flags a missing API key as authError and never calls Resend', async () => {
    delete process.env.RESEND_API_KEY
    const r = await sendMail(basic)
    expect(r.success).toBe(false)
    expect(r.authError).toBe(true)
    expect(r.error).toContain('RESEND_API_KEY')
    expect(send).not.toHaveBeenCalled()
  })

  it('flags a missing from-address as authError', async () => {
    delete process.env.RESEND_FROM_EMAIL
    const r = await sendMail(basic)
    expect(r.success).toBe(false)
    expect(r.authError).toBe(true)
    expect(r.error).toContain('RESEND_FROM_EMAIL')
    expect(send).not.toHaveBeenCalled()
  })

  it('treats an unverified domain as operator-fixable config, not a blip', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'The example.com domain is not verified' } })
    const r = await sendMail(basic)
    expect(r.success).toBe(false)
    expect(r.authError).toBe(true)
  })

  it('does NOT flag a plain delivery failure as a config problem', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'Recipient mailbox full' } })
    const r = await sendMail(basic)
    expect(r.success).toBe(false)
    expect(r.authError).toBe(false)
  })

  it('never reports success when Resend returns an error', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'anything' } })
    expect((await sendMail(basic)).success).toBe(false)
  })

  it('survives a thrown network error without claiming success', async () => {
    send.mockRejectedValue(new Error('ECONNRESET'))
    const r = await sendMail(basic)
    expect(r.success).toBe(false)
    expect(r.error).toContain('ECONNRESET')
  })
})

describe('the message Resend actually receives', () => {
  it('sends to, subject and html through unchanged', async () => {
    await sendMail(basic)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'client@example.com',
      subject: 'Invoice INV-1',
      html: '<p>due</p>',
    }))
  })

  it('keeps the verified address and swaps only the display name', async () => {
    // The address must stay one Resend has verified or the send is rejected —
    // fromName may only change what the client sees.
    await sendMail({ ...basic, fromName: 'Sillage Egypte' })
    expect(send.mock.calls[0][0].from).toBe('Sillage Egypte <notifications@autoura.net>')
  })

  it('uses the configured from verbatim when no name is given', async () => {
    await sendMail(basic)
    expect(send.mock.calls[0][0].from).toBe('Autoura <notifications@autoura.net>')
  })

  it('passes replyTo so a client reply reaches the operator', async () => {
    // Resend sends from the platform domain; without replyTo the operator never
    // sees an answer to their own invoice.
    await sendMail({ ...basic, replyTo: 'ops@sillage-egypte.com' })
    expect(send.mock.calls[0][0].replyTo).toBe('ops@sillage-egypte.com')
  })

  it('omits bcc and replyTo entirely when not supplied', async () => {
    await sendMail(basic)
    const arg = send.mock.calls[0][0]
    expect('bcc' in arg).toBe(false)
    expect('replyTo' in arg).toBe(false)
  })
})

describe('attachments', () => {
  it('decodes base64 to a Buffer rather than passing the string on', async () => {
    const content = Buffer.from('%PDF-1.4 fake').toString('base64')
    await sendMail({ ...basic, attachments: [{ filename: 'INV-1.pdf', content }] })

    const [att] = send.mock.calls[0][0].attachments
    expect(att.filename).toBe('INV-1.pdf')
    expect(Buffer.isBuffer(att.content)).toBe(true)
    // Round-trips: an ambiguous encoding is how a PDF arrives corrupt.
    expect(att.content.toString()).toBe('%PDF-1.4 fake')
  })

  it('honours a non-base64 encoding', async () => {
    await sendMail({ ...basic, attachments: [{ filename: 'a.txt', content: 'hello', encoding: 'utf8' }] })
    expect(send.mock.calls[0][0].attachments[0].content.toString()).toBe('hello')
  })

  it('omits the attachments key when there are none', async () => {
    await sendMail({ ...basic, attachments: [] })
    expect('attachments' in send.mock.calls[0][0]).toBe(false)
  })
})

describe('bareAddress', () => {
  it('extracts the address from a display-name form', () => {
    expect(bareAddress('Autoura <notifications@autoura.net>')).toBe('notifications@autoura.net')
  })

  it('passes a bare address through', () => {
    expect(bareAddress('notifications@autoura.net')).toBe('notifications@autoura.net')
  })
})
