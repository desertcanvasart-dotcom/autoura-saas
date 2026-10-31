import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ============================================================================
// Home (Dashboard, Analytics) and Getting Started (signup, onboarding,
// invitations): what each role reaches, and numbers that are not cut short.
// ============================================================================

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('onboarding and invitations', () => {
  it('the Team step route no longer creates invitations, and is admin-only', () => {
    const r = src('app/api/onboarding/team/route.ts')
    expect(r).not.toMatch(/tenant_invitations/)
    expect(r).not.toMatch(/createAdminClient/)
    expect(r).toMatch(/roleDenied\(authResult\.role, 'admin'\)/)
  })

  it('the wizard invites through POST /api/invitations', () => {
    expect(src('app/onboarding/steps/TeamSetupStep.tsx')).toMatch(/fetch\('\/api\/invitations'/)
  })

  it('every onboarding write is for owners and admins', () => {
    for (const f of ['business', 'branding', 'complete', 'vocabulary', 'team']) {
      expect(src(`app/api/onboarding/${f}/route.ts`)).toMatch(/roleDenied\([a-zA-Z.]+role, 'admin'\)/)
    }
  })

  it('only owners and admins are sent to the wizard', () => {
    expect(src('app/contexts/AuthContext.tsx')).toMatch(/onboarding_completed && \['owner', 'admin'\]/)
    expect(src('app/page.tsx')).toMatch(/onboarding_completed && \['owner', 'admin'\]/)
  })

  it('the invitation list never returns the token', () => {
    expect(src('app/api/invitations/route.ts')).toMatch(/invitation_token: _token, \.\.\.i/)
  })

  it('a login already in another company joins and lands in the new one (migration 414)', () => {
    expect(src('app/api/invitations/accept/route.ts')).toMatch(/active_tenant_id: invitation\.tenant_id/)
  })

  it('invitation links default to this app', () => {
    expect(src('app/api/invitations/route.ts')).not.toMatch(/'https:\/\/autoura\.net'/)
  })
})

describe('dashboard', () => {
  const r = src('app/api/dashboard/route.ts')
  it('totals what clients owe per currency, for staff only', () => {
    expect(r).toMatch(/sumByCurrency\(owed/)
    expect(r).toMatch(/seesMoney \?/)
  })
  it('counts are not the rows a capped read returned', () => {
    expect(r).toMatch(/departuresRes\.count/)
    expect(r).toMatch(/inboxRes\.count/)
    expect(r).not.toMatch(/\.limit\(500\)/)
  })
  it('today is the company\'s', () => {
    expect(r).toMatch(/tenantToday\(/)
  })
  it('dismissing an attention item is staff work; contracts are managers\'', () => {
    expect(src('app/api/dashboard/attention/dismiss/route.ts')).toMatch(/roleDenied\(auth\.role, 'staff'\)/)
    expect(src('app/api/dashboard/expiring-contracts/route.ts')).toMatch(/roleDenied\(auth\.role, 'manage'\)/)
  })
})

describe('analytics', () => {
  const r = src('app/api/analytics/route.ts')
  it('reads every row and every week', () => {
    expect(r).toMatch(/fetchAllPages/)
    expect(r).not.toMatch(/\.slice\(-5\)/)
  })
  it('counts sent quotes as pending and completed trips as converted', () => {
    expect(r).toMatch(/PENDING_STATUSES = \['sent'/)
    expect(r).toMatch(/bookingStats\.confirmed \+ bookingStats\.completed/)
  })
  it('follow-ups come from the table the Follow-ups page uses', () => {
    expect(r).toMatch(/from\('client_followups'\)/)
  })
  it('the page links to the real follow-ups page and invents no channel', () => {
    const p = src('app/reports/_views/AnalyticsView.tsx')
    expect(p).toMatch(/href="\/followups"/)
    expect(p).not.toMatch(/Best channel/)
  })
})
