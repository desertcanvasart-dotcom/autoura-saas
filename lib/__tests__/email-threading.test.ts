import { describe, it, expect } from 'vitest'
import { replyHeaders, threadingLines } from '@/lib/email/threading'

// ============================================
// A reply reads as a reply in the customer's inbox
// ============================================
// Gmail's threadId groups the conversation inside Gmail — for US. The
// customer's mail client threads on In-Reply-To and References, and we sent
// neither, so every answer arrived as a new, unrelated message and a long
// exchange read as a pile of disconnected emails.

const gmailWith = (messages: unknown[]) => ({
  users: { threads: { get: async () => ({ data: { messages } }) } },
})

const message = (headers: Record<string, string>) => ({
  payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
})

describe('replyHeaders', () => {
  it('answers the newest message in the thread', async () => {
    const gmail = gmailWith([
      message({ 'Message-ID': '<first@mail.test>' }),
      message({ 'Message-ID': '<second@mail.test>' }),
    ])
    expect(await replyHeaders(gmail, 't1')).toEqual({
      inReplyTo: '<second@mail.test>',
      references: '<second@mail.test>',
    })
  })

  it('keeps the chain when the thread already has one', async () => {
    const gmail = gmailWith([
      message({ 'Message-ID': '<third@mail.test>', References: '<first@mail.test> <second@mail.test>' }),
    ])
    expect(await replyHeaders(gmail, 't1')).toEqual({
      inReplyTo: '<third@mail.test>',
      references: '<first@mail.test> <second@mail.test> <third@mail.test>',
    })
  })

  it('reads the header whatever case Gmail returns it in', async () => {
    const gmail = gmailWith([message({ 'message-id': '<lower@mail.test>' })])
    expect((await replyHeaders(gmail, 't1')).inReplyTo).toBe('<lower@mail.test>')
  })

  it('says nothing when the thread names no Message-ID', async () => {
    expect(await replyHeaders(gmailWith([message({ Subject: 'No id here' })]), 't1')).toEqual({})
    expect(await replyHeaders(gmailWith([]), 't1')).toEqual({})
  })

  it('NEVER stops a reply going out when Gmail cannot answer', async () => {
    const broken = { users: { threads: { get: async () => { throw new Error('token revoked') } } } }
    // Empty headers: the reply still sends, and still threads inside Gmail.
    expect(await replyHeaders(broken, 't1')).toEqual({})
  })
})

describe('threadingLines', () => {
  it('writes both headers when both are known', () => {
    expect(threadingLines({ inReplyTo: '<a@x>', references: '<a@x>' })).toEqual([
      'In-Reply-To: <a@x>',
      'References: <a@x>',
    ])
  })

  it('writes nothing for a new conversation', () => {
    expect(threadingLines({})).toEqual([])
  })

  it('cannot smuggle a newline into the raw message', () => {
    const lines = threadingLines({ inReplyTo: '<a@x>\r\nBcc: sneak@evil.test', references: '<a@x>\nX-Evil: 1' })
    expect(lines[0]).toBe('In-Reply-To: <a@x> Bcc: sneak@evil.test')
    expect(lines.join('')).not.toContain('\n')
    expect(lines.join('')).not.toContain('\r')
  })
})
