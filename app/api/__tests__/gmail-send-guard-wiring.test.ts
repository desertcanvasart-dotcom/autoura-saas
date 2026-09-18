import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ============================================
// The guard runs BEFORE Gmail, not after
// ============================================
// The route's only duplicate check ran after Gmail had already accepted the
// message — too late to stop the customer receiving it twice. These pin the
// ordering and the wiring, which is what makes the guard worth anything.

const ROOT = path.join(__dirname, '..', '..', '..')
const route = readFileSync(path.join(ROOT, 'app/api/gmail/send/route.ts'), 'utf8')
const composer = readFileSync(path.join(ROOT, 'components/unified/EmailReplyComposer.tsx'), 'utf8')

describe('the send route', () => {
  it('claims the attempt key before it calls Gmail', () => {
    const claimAt = route.indexOf('claimSend(')
    const sendAt = route.indexOf('gmail.users.messages.send')
    expect(claimAt).toBeGreaterThan(-1)
    expect(claimAt, 'the claim must come first').toBeLessThan(sendAt)
  })

  it('checks the thread for a conflict before it calls Gmail', () => {
    expect(route.indexOf('threadConflict(')).toBeLessThan(route.indexOf('gmail.users.messages.send'))
  })

  it('answers a repeat of a sent key with that message, rather than sending again', () => {
    expect(route).toContain('alreadySent')
    expect(route).toMatch(/messageId: claim\.gmailMessageId/)
  })

  it('records the outcome both ways', () => {
    expect(route).toMatch(/finishSend\([^)]*\{\s*$|finishSend\(supabase, String\(requestKey\), \{ ok: false \}\)/m)
    expect(route).toContain('ok: true,')
    expect(route).toContain('gmailMessageId: response.data.id')
  })

  it('releases the key when Gmail itself fails, so the reply can be retried', () => {
    const catchBlock = route.slice(route.indexOf('catch (sendError)'))
    expect(catchBlock.slice(0, 300)).toContain('finishSend')
  })

  it('only skips the conflict check when the sender explicitly allows it', () => {
    expect(route).toMatch(/if \(threadId && !allowDuplicate\)/)
  })
})

describe('the reply composer', () => {
  it('sends one key per reply and repeats it on retry', () => {
    expect(composer).toContain('sendKeyRef')
    expect(composer).toMatch(/if \(!sendKeyRef\.current\) sendKeyRef\.current = crypto\.randomUUID\(\)/)
  })

  it('starts a new key only once a reply has actually gone', () => {
    const afterSuccess = composer.slice(composer.indexOf('// Sent: the next reply is a new attempt.'))
    expect(afterSuccess.slice(0, 120)).toContain('sendKeyRef.current = null')
  })

  it('says what it was looking at, so a colleague’s reply can be noticed', () => {
    expect(composer).toContain('seen_up_to: conversation.last_message_at')
  })

  it('asks the person before sending anyway', () => {
    expect(composer).toMatch(/res\.status === 409 && data\.conflict/)
    expect(composer).toContain('window.confirm')
    expect(composer).toContain('return send(true)')
  })
})
