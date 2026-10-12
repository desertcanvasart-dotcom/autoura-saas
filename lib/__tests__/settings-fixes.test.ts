import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { checkActiveChange, checkRoleChange } from '../member-role'

// ============================================================================
// Settings group: who may act on whom, and what the database itself refuses.
// ============================================================================

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('activating and deactivating users', () => {
  it('managers cannot; nobody deactivates themselves; only an owner acts on an owner', () => {
    expect(checkActiveChange({ callerId: 'm', callerRole: 'manager', targetId: 'o', targetRole: 'owner' })).toMatchObject({ ok: false, status: 403 })
    expect(checkActiveChange({ callerId: 'a', callerRole: 'admin', targetId: 'a', targetRole: 'admin' })).toMatchObject({ ok: false, status: 400 })
    expect(checkActiveChange({ callerId: 'a', callerRole: 'admin', targetId: 'o', targetRole: 'owner' })).toMatchObject({ ok: false, status: 403 })
    expect(checkActiveChange({ callerId: 'a', callerRole: 'admin', targetId: 'm', targetRole: 'member' })).toEqual({ ok: true })
  })

  it('the route refuses to leave the company without an active owner or admin', () => {
    expect(src('app/api/profiles/[id]/route.ts')).toMatch(/last active owner or admin/)
  })

  it('the old member routes use the same rules (an admin could demote the owner there)', () => {
    const r = src('app/api/admin/tenant/members/[id]/route.ts')
    expect(r).toMatch(/checkRoleChange\(/)
    expect(r).toMatch(/checkActiveChange\(/)
    expect(checkRoleChange({ callerId: 'a', callerRole: 'admin', targetId: 'o', targetRole: 'owner', newRole: 'viewer' })).toMatchObject({ ok: false })
  })
})

describe('what the database refuses', () => {
  it('only the service role sets a company WhatsApp number', () => {
    const sql = src('supabase/migrations/412_tenant_whatsapp_number_guard.sql')
    expect(sql).toMatch(/current_user IN \('authenticated', 'anon'\)/)
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.tenants/)
  })

  it('vocabulary writes and the reset need owner or admin', () => {
    const sql = src('supabase/migrations/413_vocabulary_writes_for_admins.sql')
    expect(sql).toMatch(/FOR SELECT TO authenticated/)
    expect(sql).toMatch(/IF NOT user_has_role\(ARRAY\['owner', 'admin'\]::TEXT\[\]\) THEN/)
  })
})

describe('activity and logins', () => {
  it('last seen and last login are for managers, and last seen needs Activity Summaries on', () => {
    const r = src('app/api/profiles/route.ts')
    expect(r).toMatch(/roleAllows\(authResult\.role, 'manage'\)/)
    expect(r).toMatch(/last_seen_at: canSeeLogins && activityOn/)
    expect(r).not.toMatch(/listUsers\(/)
  })

  it('the heartbeat records nothing while the feature is off, and one beat per interval', () => {
    const r = src('app/api/profiles/heartbeat/route.ts')
    expect(r).toMatch(/if \(!features\?\.activity_summary_enabled\) focused = false/)
    expect(r).toMatch(/< 270_000/)
  })
})

describe('plan and settings limits', () => {
  it('invitations respect the seat limit, on invite and on accept', () => {
    expect(src('app/api/invitations/route.ts')).toMatch(/gateStructural\(authResult\.supabase, authResult\.tenant_id, 'seats'/)
    expect(src('app/api/invitations/accept/route.ts')).toMatch(/gateStructural\(db, invitation\.tenant_id, 'seats'/)
  })

  it('the agency currency is a supported code, and settings merge', () => {
    const r = src('app/api/admin/tenant/settings/route.ts')
    expect(r).toMatch(/SUPPORTED_CURRENCIES as readonly string\[\]\)\.includes\(c\)/)
    expect(r).toMatch(/updates\.settings = \{ \.\.\.\(stored/)
  })

  it('seasonal premiums: managers write, every row is the caller\'s agency\'s, and the premium is its own line', () => {
    const r = src('app/api/pricing-seasons/route.ts')
    expect(r).toMatch(/roleDenied\(role, 'manage'\)/)
    expect(r).toMatch(/\.from\('pricing_seasons'\)\.select\('id'\)\.eq\('id', seasonId\)\.eq\('tenant_id', tenant_id\)/)
    const pv = src('lib/b2b/price-variation.ts')
    expect(pv).toMatch(/season_premium: seasonPremium/)
    expect(pv).toMatch(/autoPriceResult\.marginAmount - \(autoPriceResult\.seasonUplift \|\| 0\)/)
  })
})
