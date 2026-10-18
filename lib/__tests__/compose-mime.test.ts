import { describe, it, expect } from 'vitest'
import {
  buildRawEmail, parseRecipients, replyRecipients, replySubject, forwardSubject, wrapBase64,
  quotedOriginal, forwardedOriginal,
} from '@/lib/email/compose-mime'

const decode = (raw: string) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
const header = (msg: string, name: string) => msg.split('\r\n\r\n')[0].split('\r\n').find(l => l.startsWith(`${name}: `))

describe('parseRecipients', () => {
  it('reads strings, lists, names and semicolons', () => {
    expect(parseRecipients('a@x.com, Ann <B@y.com>; c@z.org').valid).toEqual(['a@x.com', 'b@y.com', 'c@z.org'])
    expect(parseRecipients(['a@x.com', 'a@x.com']).valid).toEqual(['a@x.com'])
  })
  it('reports what is not an address instead of dropping it', () => {
    const r = parseRecipients('a@x.com, bob, c@nodot')
    expect(r.valid).toEqual(['a@x.com'])
    expect(r.invalid).toEqual(['bob', 'c@nodot'])
  })
  it('is empty for nothing', () => {
    expect(parseRecipients(undefined)).toEqual({ valid: [], invalid: [] })
  })
})

describe('buildRawEmail', () => {
  it('writes To, Cc and Bcc headers', () => {
    const msg = decode(buildRawEmail({ to: ['a@x.com'], cc: ['b@y.com', 'c@z.com'], bcc: ['d@w.com'], subject: 'Hi', html: '<p>x</p>' }))
    expect(header(msg, 'To')).toBe('To: a@x.com')
    expect(header(msg, 'Cc')).toBe('Cc: b@y.com, c@z.com')
    expect(header(msg, 'Bcc')).toBe('Bcc: d@w.com')
  })
  it('leaves out empty Cc and Bcc', () => {
    const msg = decode(buildRawEmail({ to: ['a@x.com'], subject: 'Hi', html: 'x' }))
    expect(header(msg, 'Cc')).toBeUndefined()
    expect(header(msg, 'Bcc')).toBeUndefined()
  })
  it('cannot be given extra headers through a recipient or subject', () => {
    const msg = decode(buildRawEmail({ to: ['a@x.com\r\nBcc: evil@x.com'], subject: 'Hi\r\nBcc: evil@x.com', html: 'x' }))
    expect(msg.split('\r\n\r\n')[0].split('\r\n').filter(l => l.startsWith('Bcc:'))).toEqual([])
  })
  it('base64-encodes the body in lines of at most 76', () => {
    const msg = decode(buildRawEmail({ to: ['a@x.com'], subject: 'Hi', html: '<p>' + 'é'.repeat(2000) + '</p>' }))
    const body = msg.split('\r\n\r\n')[1]
    expect(body.split('\r\n').every(l => l.length <= 76)).toBe(true)
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')).toContain('éé')
  })
  it('adds threading headers and attachments', () => {
    const msg = decode(buildRawEmail({
      to: ['a@x.com'], subject: 'Re: Hi', html: 'x',
      threading: { inReplyTo: '<m1@x>', references: '<m0@x> <m1@x>' },
      attachments: [{ filename: 'Reservación.pdf', mimeType: 'application/pdf', data: Buffer.from('PDF').toString('base64') }],
    }))
    expect(msg).toContain('In-Reply-To: <m1@x>')
    expect(msg).toContain('multipart/mixed')
    expect(msg).toContain("filename*=UTF-8''Reservaci%C3%B3n.pdf")
  })
})

describe('wrapBase64', () => {
  it('wraps at 76', () => {
    expect(wrapBase64('a'.repeat(160)).split('\r\n').map(l => l.length)).toEqual([76, 76, 8])
  })
})

describe('replyRecipients', () => {
  const own = (a: string) => a === 'me@agency.com' || a.endsWith('@agency.com')
  const msg = { from: 'Ann <ann@client.com>', to: 'me@agency.com, bob@client.com', cc: 'Carl <carl@hotel.com>, ops@agency.com' }

  it('reply goes to the sender only', () => {
    expect(replyRecipients(msg, own, false)).toEqual({ to: ['ann@client.com'], cc: [] })
  })
  it('reply all adds everyone else and leaves out our own addresses', () => {
    expect(replyRecipients(msg, own, true)).toEqual({ to: ['ann@client.com'], cc: ['bob@client.com', 'carl@hotel.com'] })
  })
  it('uses Reply-To when the sender set one', () => {
    expect(replyRecipients({ ...msg, replyTo: 'bookings@client.com' }, own, false).to).toEqual(['bookings@client.com'])
  })
  it('replying to our own sent message goes to its recipients', () => {
    const sent = { from: 'me@agency.com', to: 'ann@client.com', cc: 'bob@client.com' }
    expect(replyRecipients(sent, own, true)).toEqual({ to: ['ann@client.com'], cc: ['bob@client.com'] })
  })
  it('never lists one person twice', () => {
    const dup = { from: 'ann@client.com', to: 'ann@client.com', cc: 'ann@client.com' }
    expect(replyRecipients(dup, own, true)).toEqual({ to: ['ann@client.com'], cc: [] })
  })
})

describe('subjects and quoting', () => {
  it('prefixes once', () => {
    expect(replySubject('Re: Trip')).toBe('Re: Trip')
    expect(replySubject('Trip')).toBe('Re: Trip')
    expect(forwardSubject('Fwd: Trip')).toBe('Fwd: Trip')
    expect(forwardSubject('FW: Trip')).toBe('FW: Trip')
    expect(forwardSubject('Trip')).toBe('Fwd: Trip')
  })
  it('escapes header text in the quoted and forwarded blocks', () => {
    const m = { from: '<script>x</script>', subject: '<b>', date: '2026-01-01', body: '<p>ok</p>' }
    expect(quotedOriginal(m)).not.toContain('<script>')
    expect(forwardedOriginal(m)).toContain('Subject: &lt;b&gt;')
    expect(forwardedOriginal(m)).toContain('<p>ok</p>')
  })
})
