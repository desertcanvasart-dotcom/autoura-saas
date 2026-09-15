// The super-admin redirect loop (operator, 1 Sep): every tenant page bounced
// a platform owner to /super-admin.
//
// hello@getautoura.net is a super admin AND the owner of a tenant, so it has
// an ordinary user_profiles row — which had been deactivated (is_active
// false). The tenant RBAC gate sent that deactivated account to /login, and
// the /login guard sent an authenticated super admin to /super-admin. Every
// tenant page therefore redirected to the super-admin dashboard.
//
// Three guarantees here:
//   1. A super admin is never subjected to the tenant is_active / role gate.
//   2. A deactivated ORDINARY account is SIGNED OUT before the /login redirect
//      — otherwise the still-live session bounces it straight back in, an
//      infinite loop that this same code path had for every deactivated user.
//   3. The ROLE gate reads the MEMBERSHIP, not the profile. is_active still
//      comes from the profile, so the two now come from two tables.
import { describe, it, expect, vi, beforeEach } from 'vitest'

let currentUser: { id: string; email: string } | null = null
let currentProfile: { is_active: boolean } | null = null
let currentMembership: { role: string } | null = null
const signOut = vi.fn(async () => ({ error: null }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
      signOut,
    },
    // Table-aware: the gate reads is_active from user_profiles and the role
    // from tenant_members, so one canned row can no longer answer both.
    from: (table: string) => {
      const result = () => ({
        data: table === 'tenant_members' ? currentMembership : currentProfile,
      })
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        single: async () => result(),
        maybeSingle: async () => result(),
      }
      return chain
    },
  }),
}))

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon-key'
process.env.SUPER_ADMIN_EMAILS = 'owner@platform.test'

import { middleware } from '@/middleware'
import { NextRequest } from 'next/server'

const req = (pathname: string) =>
  new NextRequest(new URL(`https://app.test${pathname}`))

const locationOf = (res: Response) => res.headers.get('location')

beforeEach(() => {
  signOut.mockClear()
  currentUser = null
  currentProfile = null
  currentMembership = null
})

describe('super-admin / deactivated redirect handling', () => {
  it('lets a super admin through a tenant page even with a deactivated profile', async () => {
    // The exact reported case: owner@platform.test, is_active=false, on /rates.
    currentUser = { id: 'u1', email: 'owner@platform.test' }
    currentProfile = { is_active: false }
    currentMembership = { role: 'manager' }
    const res = await middleware(req('/rates'))
    expect(locationOf(res)).toBeNull() // no redirect at all
    expect(signOut).not.toHaveBeenCalled()
  })

  it('does not gate a super admin by role either', async () => {
    // /settings is admin-only; a super admin whose membership says manager
    // must still pass.
    currentUser = { id: 'u1', email: 'owner@platform.test' }
    currentProfile = { is_active: true }
    currentMembership = { role: 'manager' }
    const res = await middleware(req('/settings'))
    expect(locationOf(res)).toBeNull()
  })

  it('signs out a deactivated ORDINARY user before sending them to /login', async () => {
    currentUser = { id: 'u2', email: 'agent@tenant.test' }
    currentProfile = { is_active: false }
    currentMembership = { role: 'manager' }
    const res = await middleware(req('/rates'))
    expect(locationOf(res)).toContain('/login?error=account_inactive')
    // The loop fix: the session must be cleared, or /login bounces them back.
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('still enforces role on active ordinary users', async () => {
    currentUser = { id: 'u3', email: 'viewer@tenant.test' }
    currentProfile = { is_active: true }
    currentMembership = { role: 'viewer' }
    const res = await middleware(req('/settings')) // admin-only
    expect(locationOf(res)).toContain('/dashboard?error=unauthorized')
  })

  it('lets an active ordinary user into a route their role allows', async () => {
    currentUser = { id: 'u4', email: 'mgr@tenant.test' }
    currentProfile = { is_active: true }
    currentMembership = { role: 'manager' }
    const res = await middleware(req('/rates'))
    expect(locationOf(res)).toBeNull()
  })

  it('lets a tenant OWNER into an admin-only route', async () => {
    // The landmine of moving the gate onto tenant_members.role:
    // ROUTE_PERMISSIONS contains no 'owner' entry anywhere, so a raw
    // membership role would lock every owner out of the workspace they own.
    currentUser = { id: 'u5', email: 'owner@tenant.test' }
    currentProfile = { is_active: true }
    currentMembership = { role: 'owner' }
    const res = await middleware(req('/settings'))
    expect(locationOf(res)).toBeNull()
  })

  it('treats a user with NO active membership as a viewer', async () => {
    // Fails closed: no membership must never read as unrestricted.
    currentUser = { id: 'u6', email: 'nobody@tenant.test' }
    currentProfile = { is_active: true }
    currentMembership = null
    const res = await middleware(req('/settings'))
    expect(locationOf(res)).toContain('/dashboard?error=unauthorized')
  })
})
