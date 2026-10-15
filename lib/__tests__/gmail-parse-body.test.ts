import { describe, it, expect } from 'vitest'
import { parseEmailMessage } from '@/lib/gmail'

// Inbound bodies are attacker-controlled and rendered as HTML. A plain-text
// body is wrapped in <pre>, so it must be escaped whichever way it arrives —
// as the whole message, or as the text part of a multipart one.

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64')
const evil = '</pre><img src=x onerror=alert(1)> a < b'

describe('parseEmailMessage plain-text bodies', () => {
  it('escapes a single-part text/plain body', () => {
    const { body } = parseEmailMessage({ id: '1', payload: { mimeType: 'text/plain', body: { data: b64(evil) } } })
    expect(body).not.toContain('<img')
    expect(body).toContain('&lt;/pre&gt;&lt;img')
  })

  it('escapes the text/plain fallback of a multipart message', () => {
    const { body } = parseEmailMessage({
      id: '2',
      payload: { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: b64(evil) } }] },
    })
    expect(body).not.toContain('<img')
    expect(body).toContain('a &lt; b')
  })

  it('still prefers the HTML part when there is one', () => {
    const { body } = parseEmailMessage({
      id: '3',
      payload: {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/plain', body: { data: b64('plain') } },
          { mimeType: 'text/html', body: { data: b64('<p>html</p>') } },
        ],
      },
    })
    expect(body).toBe('<p>html</p>')
  })
})
