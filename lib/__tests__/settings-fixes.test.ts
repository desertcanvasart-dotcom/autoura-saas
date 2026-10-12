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

describe('settings pages that said one thing and did another', () => {
  it('billing reads the real subscription, and the portal button reads the URL the route returns', () => {
    expect(src('app/api/billing/subscription/route.ts')).toMatch(/from\('tenant_subscriptions'\)/)
    expect(src('app/settings/billing/page.tsx')).toMatch(/data\.portal_url \|\| data\.url/)
  })

  it('an invitation is resent in one request, and a failed email says so', () => {
    expect(src('app/api/invitations/route.ts')).toMatch(/existingInvitation && body\.resend === true/)
    const page = src('app/users/page.tsx')
    expect(page).toMatch(/resend: true/)
    expect(page).toMatch(/data\.emailSent === false/)
    expect(page).toMatch(/invitableRoles\.map/)
  })

  it('email templates can be edited and deleted (the route had neither)', () => {
    const r = src('app/api/email/templates/route.ts')
    expect(r).toMatch(/export async function PUT/)
    expect(r).toMatch(/export async function DELETE/)
    expect(r).not.toMatch(/from\('email_templates'\)/)
  })

  it('only edited exchange rates are saved, each checked', () => {
    expect(src('app/settings/page.tsx')).toMatch(/exchangeRates\.filter\(r => editedRates\.has/)
    expect(src('app/api/exchange-rates/route.ts')).toMatch(/Some rates could not be saved/)
  })

  it('activity ranges are whole days, today included', () => {
    expect(src('app/api/activity/route.ts')).toMatch(/startOfToday\.getTime\(\) - \(days - 1\)/)
  })

  it('a logo that fails to upload stops the save', () => {
    expect(src('app/settings/tenant/page.tsx')).toMatch(/The logo could not be uploaded, so nothing was saved/)
  })
})

describe('signatures', () => {
  it('an HTML signature loses scripts and handlers; plain text is kept as typed', async () => {
    const { cleanSignature } = await import('../email/signature')
    const cleaned = cleanSignature('<p onclick="x()">Ali<script>alert(1)</script></p>')
    expect(cleaned).not.toMatch(/script|onclick/)
    expect(cleanSignature('Ali & Co\nCairo')).toBe('Ali & Co\nCairo')
  })

  it('switching signatures replaces the whole block', async () => {
    const { swapSignatureBlock } = await import('../email/signature')
    const body = '<p>Hi</p><div data-signature="true">--<br/><div>Ali</div><div>Cairo</div></div>'
    expect(swapSignatureBlock(body, '<div data-signature="true">--<br/>Omar</div>')).toBe('<p>Hi</p><div data-signature="true">--<br/>Omar</div>')
  })
})

describe('vocabulary, aliases, day blocks and destinations', () => {
  it('the tier ladder keeps hidden tiers in place, so hiding one reprices nothing', () => {
    const r = src('lib/vocabulary-server.ts')
    expect(r).toMatch(/HIDDEN TIERS INCLUDED/)
    expect(r.slice(r.indexOf('export async function tierLadderForTenant'), r.indexOf('export async function vehicleBandsForTenant'))).not.toMatch(/activeInOrder/)
  })

  it('a tier or supplier type in use is not deleted without a second yes; duplicate labels are refused', () => {
    expect(src('app/api/vocabulary/[id]/route.ts')).toMatch(/current\.kind === 'tier' \|\| current\.kind === 'supplier_type'/)
    expect(src('app/api/vocabulary/route.ts')).toMatch(/is already in this list/)
  })

  it('aliases match whatever the spacing, and are checked when switched back on', async () => {
    const { buildAliasIndex, resolveAttractionAlias } = await import('../pricing/attraction-aliases')
    const index = buildAliasIndex([{ tenant_id: 't', alias: 'Giza Plateau', canonical: 'Giza Pyramids' } as never])
    expect(resolveAttractionAlias('Giza  Plateau', index)).toEqual(['Giza Pyramids'])
    expect(src('app/api/attraction-aliases/[id]/route.ts')).toMatch(/const switchingOn = body\.is_active === true && !current\.is_active/)
  })

  it('a day block list splits on semicolons only — a comma is part of a name', async () => {
    const { listCell } = await import('../day-blocks/blocks')
    expect(listCell('Hatshepsut Temple, Deir el-Bahari; Valley of the Kings')).toEqual(['Hatshepsut Temple, Deir el-Bahari', 'Valley of the Kings'])
  })

  it('a stored city outside your list stays selectable in rate forms', () => {
    expect(src('app/rates/hotels/hotels-content.tsx')).toMatch(/cityOptionsFor\(cityOptions, formData\.city/)
    expect(src('app/api/destination-catalog/manage/route.ts')).toMatch(/is already in this country/)
  })
})
