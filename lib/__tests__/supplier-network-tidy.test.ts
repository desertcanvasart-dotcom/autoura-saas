import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canTransition } from '@/lib/bookings/service-booking-states'
import { answerAllowed } from '@/lib/bookings/supplier-answer'
import { resolvePortalLink, resolveReplyLink } from '@/lib/supplier-link-lookup'

// Audit 2026-10-31 SN-12, SN-13, SN-14 (dead code) and decision D2 (operator,
// 2026-11-01: a supplier who declined or timed out can still accept).

const read = (p: string) => readFileSync(p, 'utf8')

describe('late answers (D2)', () => {
  it('a declined or unanswered line can still be accepted or given a car', () => {
    for (const from of ['declined', 'expired'] as const) {
      expect(canTransition(from, 'accepted').ok).toBe(true)
      expect(canTransition(from, 'assigned').ok).toBe(true)
      expect(answerAllowed(from, 'accepted', 'supplier')).toBe(true)
    }
  })

  it('a supplier who timed out can still say no; done and not-needed stay closed', () => {
    expect(answerAllowed('expired', 'declined', 'supplier')).toBe(true)
    expect(answerAllowed('done', 'accepted', 'supplier')).toBe(false)
    expect(canTransition('cancelled', 'accepted').ok).toBe(false)
  })

  it('own cars are still never asked', () => {
    expect(canTransition('declined', 'accepted', 'own').ok).toBe(false)
  })

  it('the reply buttons offer Accept again on a declined or timed-out line', () => {
    const src = read('app/reply/[token]/ReplyButtons.tsx')
    expect(src).toContain("const canAccept = !answered || status === 'declined'")
    expect(src).toMatch(/LATE: Record<string, string> = \{\s*declined:[\s\S]*expired:/)
  })

  it("the supplier's page reads declined and timed-out lines", () => {
    expect(read('lib/supplier-page-data.ts')).toContain("'requested', 'declined', 'expired'")
  })
})

/** A query builder that answers maybeSingle() with `row`. */
function oneRow(row: Record<string, unknown> | null, error: { message: string } | null = null): SupabaseClient {
  const b: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'is']) b[m] = () => b
  b.maybeSingle = () => Promise.resolve({ data: row, error })
  return b as unknown as SupabaseClient
}

const TOKEN = 'a'.repeat(32)

describe('one lookup per kind of link (SN-12)', () => {
  it('a malformed token never reaches the database', async () => {
    const db = { from: () => { throw new Error('should not query') } } as unknown as SupabaseClient
    expect(await resolvePortalLink(db, 'nope')).toBeNull()
    expect(await resolveReplyLink(db, 'nope')).toBeNull()
  })

  it('a reply link past its expiry is no link', async () => {
    const row = { id: 'l', tenant_id: 't', booking_id: 'b', service_booking_id: 's', revoked_at: null, expires_at: '2026-01-01T00:00:00Z' }
    expect(await resolveReplyLink(oneRow(row), TOKEN, new Date('2026-06-01T00:00:00Z'))).toBeNull()
    expect(await resolveReplyLink(oneRow(row), TOKEN, new Date('2025-12-01T00:00:00Z'))).toEqual({ id: 'l', tenant_id: 't', booking_id: 'b', service_booking_id: 's' })
  })

  it('a database error is an error, not "this link no longer works"', async () => {
    await expect(resolvePortalLink(oneRow(null, { message: 'down' }), TOKEN)).rejects.toThrow(/down/)
  })

  it('every token page and route resolves through it', () => {
    for (const f of ['app/supplier/[token]/page.tsx', 'app/api/supplier-page/[token]/lines/[lineId]/route.ts', 'app/api/supplier-page/[token]/days-off/route.ts']) {
      expect(read(f)).toContain('resolvePortalLink(db, token)')
      expect(read(f)).not.toContain(".eq('token', token)")
    }
    for (const f of ['app/reply/[token]/page.tsx', 'app/api/reply/[token]/route.ts']) {
      expect(read(f)).toContain('resolveReplyLink(db, token)')
      expect(read(f)).not.toContain(".eq('token', token)")
    }
  })

  it('the untyped admin cast lives in one place', () => {
    expect(read('lib/supabase-server.ts')).toContain('export function adminDb(): SupabaseClient')
    for (const f of ['app/api/supplier-auth/code/route.ts', 'app/api/cron/service-booking-deadlines/route.ts', 'app/supplier-home/page.tsx']) {
      expect(read(f)).not.toContain('createAdminClient() as unknown as SupabaseClient')
      expect(read(f)).toContain('adminDb()')
    }
  })
})

describe('panels say when they fail to load (SN-13)', () => {
  it.each([
    ['components/SupplierPageLink.tsx', 'the supplier’s page link'],
    ['components/DaysOffEditor.tsx', 'the days off'],
    ['app/supplier-home/NetworkJoin.tsx', 'your network profile'],
    ['components/SupplierSignInRequests.tsx', 'suppliers asking to sign in'],
  ])('%s', (file, what) => {
    const src = read(file)
    expect(src).toContain(`<LoadError compact what="${what}"`)
    expect(src).not.toContain('.catch(() => {})')
  })

  it('the sourcing setting can be retried', () => {
    expect(read('components/SupplierSourcingSetting.tsx')).toContain('setAttempt(a => a + 1)')
  })
})

describe('dead code (SN-14)', () => {
  it('maskEmail is gone', () => {
    expect(read('lib/supplier-accounts.ts')).not.toContain('maskEmail')
  })
})
