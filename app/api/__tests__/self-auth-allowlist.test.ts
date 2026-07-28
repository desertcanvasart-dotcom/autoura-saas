import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { SELF_AUTH_API_PREFIXES } from '@/middleware'

// ============================================================================
// A route that authenticates itself (by token, secret or signature) is
// unreachable unless the middleware also knows that — it returns 401 before
// the handler runs. The invite flow died exactly this way: /api/invitations/
// verify checks the invitation_token, but an invitee has no session, so every
// invitation link showed "Invalid or expired invitation".
// ============================================================================

describe('the invite flow is reachable without a session', () => {
  it('allowlists both token-gated invite endpoints', () => {
    expect(SELF_AUTH_API_PREFIXES).toContain('/api/invitations/verify')
    expect(SELF_AUTH_API_PREFIXES).toContain('/api/invitations/accept')
  })

  it('does NOT allowlist the session-gated collection route', () => {
    // '/api/invitations' as a prefix would expose GET/POST/DELETE, which
    // list, create and cancel invitations for a tenant.
    expect(SELF_AUTH_API_PREFIXES).not.toContain('/api/invitations')
  })

  it('accept lives on its own path, since matching is by path not method', () => {
    const p = path.join(process.cwd(), 'app/api/invitations/accept/route.ts')
    expect(fs.existsSync(p), 'accept route must exist').toBe(true)
    expect(fs.readFileSync(p, 'utf8')).toContain('export async function POST')
  })

  it('the old PUT accept handler is gone, so there is one code path', () => {
    const collection = fs.readFileSync(
      path.join(process.cwd(), 'app/api/invitations/route.ts'), 'utf8'
    )
    expect(collection).not.toContain('export async function PUT')
  })
})

describe('platform mail does not route through a user mailbox', () => {
  const files = [
    'app/api/invitations/route.ts',
    'app/api/cron/task-reminders/route.ts',
  ]

  it('neither caller FETCHES /api/gmail/send', () => {
    for (const f of files) {
      const src = fs.readFileSync(path.join(process.cwd(), f), 'utf8')
      // Match a real call, not the comment explaining why we stopped making
      // one — a substring check on the path flags its own documentation.
      expect(src.match(/fetch\([^)]*\/api\/gmail\/send/), f).toBeNull()
      expect(src, f).toContain('sendMail(')
    }
  })
})
