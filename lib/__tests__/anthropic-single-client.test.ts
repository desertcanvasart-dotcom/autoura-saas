import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { getUserFriendlyError, isAiServiceError, replyText } from '@/lib/ai/anthropic-client'

// ============================================================================
// One Anthropic client, and a failed CALL is never reported as a failed PARSE.
//
// 2026-09-16: production's API key was rejected (401). The pricing grid told
// the operator "Could not parse or generate itinerary from the provided text";
// the copilot, knowledge import, file upload and WhatsApp parser each surfaced
// the SDK's raw `401 {"type":"error",...}` or swallowed it. Every one of them
// built its own `new Anthropic()` and its own (or no) retry and error handling.
//
// Now lib/ai/anthropic-client.ts is the only place a client is constructed or
// messages.create is called; everything else goes through
// createMessageWithRetry, and routes answer service faults with
// getUserFriendlyError.
// ============================================================================

const ROOT = path.resolve(__dirname, '../..')
const CLIENT = 'lib/ai/anthropic-client.ts'

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      out.push(...sourceFiles(rel))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(rel)
    }
  }
  return out
}

const files = [...sourceFiles('app'), ...sourceFiles('lib'), ...sourceFiles('components')]
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

describe('one Anthropic client', () => {
  it('only lib/ai/anthropic-client.ts constructs an Anthropic client', () => {
    const offenders = files.filter(f => f !== CLIENT && /new\s+Anthropic\s*\(/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('nothing else calls messages.create on an Anthropic client', () => {
    // twilio-whatsapp's `client.messages.create` is Twilio, not Anthropic.
    const offenders = files.filter(f => {
      if (f === CLIENT) return false
      const src = read(f)
      return /@anthropic-ai\/sdk|anthropic-client/.test(src) && /\bmessages\.create\s*\(/.test(src)
    })
    expect(offenders).toEqual([])
  })
})

describe('one model name', () => {
  // 2026-09-16: claude-sonnet-4-20250514 was retired while hard-coded in ~15
  // places, and every AI feature 404'd at once. lib/ai/models.ts names it.
  it('no model id is written as a string literal outside lib/ai/models.ts', () => {
    const offenders = files.filter(f => f !== 'lib/ai/models.ts' && /['"`]claude-[a-z0-9.-]+['"`]/.test(read(f)))
    expect(offenders).toEqual([])
  })
})

describe('reading a reply', () => {
  // Sonnet 5 thinks by default: the first block is `thinking`, the answer after.
  // Reading content[0] saw no text on every call (2026-09-16).
  it('nothing reads only the first content block of a reply', () => {
    const offenders = files.filter(f => f !== CLIENT && /\bcontent\[0\]/.test(read(f)) && /anthropic-client|@anthropic-ai\/sdk/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('replyText joins the text after a thinking block', () => {
    const message = {
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: '{"days":', citations: null },
        { type: 'text', text: '[]}', citations: null },
      ],
      stop_reason: 'end_turn',
    } as unknown as Anthropic.Message
    expect(replyText(message)).toBe('{"days":[]}')
  })

  it('an empty reply is logged with its stop reason', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const message = { content: [{ type: 'thinking', thinking: '', signature: 's' }], stop_reason: 'max_tokens' } as unknown as Anthropic.Message
    expect(replyText(message)).toBe('')
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/stop_reason=max_tokens/))
  })
})

describe('isAiServiceError — the service failed, not the reply', () => {
  const headers = new Headers()

  it('is true for API errors of every status, and for connection failures', () => {
    expect(isAiServiceError(new Anthropic.AuthenticationError(401, undefined, 'bad key', headers))).toBe(true)
    expect(isAiServiceError(new Anthropic.RateLimitError(429, undefined, 'slow down', headers))).toBe(true)
    expect(isAiServiceError(new Anthropic.NotFoundError(404, undefined, 'no model', headers))).toBe(true)
    expect(isAiServiceError(new Anthropic.APIConnectionError({ message: 'socket hang up' }))).toBe(true)
  })

  it('is true for a missing key', () => {
    expect(isAiServiceError(new Error('ANTHROPIC_API_KEY is not configured'))).toBe(true)
  })

  it('is false for an unusable reply', () => {
    let parseError: unknown
    try { JSON.parse('Sorry, I cannot help') } catch (e) { parseError = e }
    expect(isAiServiceError(parseError)).toBe(false)
    expect(isAiServiceError(new Error('No drafts in response'))).toBe(false)
  })
})

describe('getUserFriendlyError names the fault', () => {
  const headers = new Headers()
  vi.spyOn(console, 'error').mockImplementation(() => {})

  it.each([
    [new Anthropic.AuthenticationError(401, undefined, 'bad key', headers), /authentication failed/i],
    [new Anthropic.PermissionDeniedError(403, undefined, 'nope', headers), /permission denied/i],
    [new Anthropic.NotFoundError(404, undefined, 'model: claude-x', headers), /model .* no longer available/i],
    [new Anthropic.APIConnectionError({ message: 'socket hang up' }), /could not reach/i],
    [new Anthropic.BadRequestError(400, undefined, 'Your credit balance is too low', headers), /billing/i],
  ])('%s', (error, expected) => {
    expect(getUserFriendlyError(error).message).toMatch(expected)
  })
})
