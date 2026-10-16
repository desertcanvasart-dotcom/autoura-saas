import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sealToken, openToken, isSealed } from '@/lib/token-crypto'
import { isInvalidGrant } from '@/lib/gmail-revoke'
import { gmailReconnectResponse } from '@/lib/gmail-reconnect'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
afterEach(() => { delete process.env.TOKEN_ENCRYPTION_KEY })

describe('Gmail tokens at rest', () => {
  it('sealed with the key, opened back to the same token', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'a-long-test-key-for-encryption-123'
    const sealed = sealToken('1//refresh-token')
    expect(isSealed(sealed)).toBe(true)
    expect(sealed).not.toContain('refresh-token')
    expect(openToken(sealed)).toBe('1//refresh-token')
    expect(sealToken(sealed)).toBe(sealed) // never double-sealed
  })
  it('without a key nothing is sealed, and plain tokens pass straight through', () => {
    expect(sealToken('plain')).toBe('plain')
    expect(openToken('plain')).toBe('plain')
    expect(openToken(null)).toBeNull()
  })
  it('a sealed token with no key fails loudly rather than sending garbage to Google', () => {
    process.env.TOKEN_ENCRYPTION_KEY = 'a-long-test-key-for-encryption-123'
    const sealed = sealToken('x')
    delete process.env.TOKEN_ENCRYPTION_KEY
    expect(() => openToken(sealed)).toThrow(/TOKEN_ENCRYPTION_KEY/)
  })
  it('every write seals and every Google client opens', () => {
    expect(read('app/api/auth/google/callback/route.ts')).toContain('refresh_token: sealToken(tokens.refresh_token)')
    expect(read('lib/gmail-mailbox.ts')).toContain('access_token: sealToken(fresh.access_token)')
    for (const f of ['app/api/gmail/emails/route.ts', 'app/api/gmail/actions/route.ts', 'app/api/gmail/labels/route.ts', 'app/api/gmail/send/route.ts']) {
      expect(read(f), f).toContain('access_token: sealToken(newTokens.access_token)')
    }
    const gmail = read('lib/gmail.ts')
    expect(gmail).toContain('refresh_token: openToken(refreshToken)')
    expect(gmail).toContain('access_token: openToken(accessToken)')
    expect(read('app/api/cron/mail-alerts/route.ts')).toContain('openToken(box.refresh_token)')
  })
})

describe('disconnecting really disconnects', () => {
  it('Disconnect goes through the server, which revokes at Google', () => {
    const page = read('app/settings/email/page.tsx')
    expect(page).toContain("fetch('/api/gmail/connect', { method: 'DELETE' })")
    expect(page).not.toMatch(/from\('gmail_tokens'\)\s*\.delete\(\)/)
    expect(read('lib/gmail-revoke.ts')).toContain('createOAuthClient().revokeToken(token)')
  })
  it('removing a member or deleting a user clears their mailboxes', () => {
    expect(read('app/api/admin/tenant/members/[id]/route.ts')).toContain('revokeAndForgetMailbox(removedUser, tenant_id)')
    expect(read('app/api/super-admin/users/[id]/route.ts')).toContain('revokeAndForgetMailbox(id, null)')
    expect(read('supabase/migrations/432_gmail_tokens_follow_the_user.sql')).toContain('REFERENCES auth.users(id) ON DELETE CASCADE')
  })
})

describe('an expired Google sign-in asks for a reconnect', () => {
  it('recognises invalid_grant in both shapes googleapis throws', () => {
    expect(isInvalidGrant(new Error('invalid_grant'))).toBe(true)
    expect(isInvalidGrant({ response: { data: { error: 'invalid_grant' } } })).toBe(true)
    expect(isInvalidGrant(new Error('quota'))).toBe(false)
  })
  it('answers 401 with reconnect: true', async () => {
    const res = gmailReconnectResponse(new Error('invalid_grant'))!
    expect(res.status).toBe(401)
    expect((await res.json()).reconnect).toBe(true)
    expect(gmailReconnectResponse(new Error('other'))).toBeNull()
  })
  it('the Gmail routes use it', () => {
    vi.clearAllMocks()
    for (const f of ['send', 'poll', 'emails', 'actions', 'labels', 'attachments']) {
      expect(read(`app/api/gmail/${f}/route.ts`), f).toContain('gmailReconnectResponse(')
    }
    expect(read('lib/gmail-mailbox.ts')).toContain('gmailReconnectResponse(err)')
  })
})
