import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTeamMemberWrite, teamMemberSaveError, staffTypeForRole } from '../team/team-member-fields'
import { parsePartnerWrite, nextPartnerCode } from '../b2b/partner-fields'

// ============================================================================
// People group: team members and partners take only the fields their forms
// edit, checked; writes are for managers.
// ============================================================================

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8')

describe('team member writes', () => {
  it('a new member needs a name and gets the role\'s staff type', () => {
    expect(parseTeamMemberWrite({ email: 'a@b.co' }, 'create')).toEqual({ error: 'Name is required' })
    const r = parseTeamMemberWrite({ name: ' Ali ', role: 'driver', email: '' }, 'create')
    expect(r).toEqual({ data: { name: 'Ali', role: 'driver', staff_type: 'driver', email: null } })
  })

  it('accepts every job title the page offers and refuses others', () => {
    for (const role of ['coordinator', 'sales', 'guide', 'driver']) {
      expect('data' in parseTeamMemberWrite({ name: 'X', role }, 'create')).toBe(true)
    }
    expect(parseTeamMemberWrite({ name: 'X', role: 'admin' }, 'create')).toHaveProperty('error')
    expect(parseTeamMemberWrite({ name: 'X', staff_type: 'pilot' }, 'create')).toHaveProperty('error')
  })

  it('an update sets only what it sends, and never columns outside the form', () => {
    const r = parseTeamMemberWrite({ phone: '+20 100', tenant_id: 'other', user_id: 'u' }, 'update')
    expect(r).toEqual({ data: { phone: '+20 100' } })
  })

  it('refuses a malformed email and a non-boolean active flag', () => {
    expect(parseTeamMemberWrite({ name: 'X', email: 'nope' }, 'create')).toHaveProperty('error')
    expect(parseTeamMemberWrite({ is_active: 'yes' }, 'update')).toHaveProperty('error')
  })

  it('says a duplicate email plainly', () => {
    expect(teamMemberSaveError({ code: '23505', message: 'team_members_tenant_email_key email' })).toMatch(/already has that email/)
    expect(staffTypeForRole('sales')).toBe('office')
  })

  it('writes are gated to managers; migration 410 allows the job titles', () => {
    expect(src('app/api/team-members/route.ts')).toMatch(/roleDenied\(authResult\.role, 'manage'\)/)
    expect(src('app/api/team-members/[id]/route.ts')).toMatch(/roleDenied|gateRole/)
    expect(src('supabase/migrations/410_team_member_roles.sql')).toMatch(/'coordinator', 'sales', 'guide', 'driver'/)
  })
})

describe('partner writes', () => {
  it('a new partner needs a company name; columns outside the form are dropped', () => {
    expect(parsePartnerWrite({}, 'create')).toEqual({ error: 'Company name is required' })
    const r = parsePartnerWrite({ company_name: 'Nile Co', tenant_id: 'x', created_by: 'y', email: ' ' }, 'create')
    expect(r).toEqual({ data: { company_name: 'Nile Co', email: null } })
  })

  it('checks the margin, credit limit and currency', () => {
    expect(parsePartnerWrite({ default_margin_percent: 120 }, 'update')).toHaveProperty('error')
    expect(parsePartnerWrite({ credit_limit: -1 }, 'update')).toHaveProperty('error')
    expect(parsePartnerWrite({ currency: 'xyz' }, 'update')).toHaveProperty('error')
    expect(parsePartnerWrite({ currency: 'usd', default_margin_percent: '15' }, 'update'))
      .toEqual({ data: { currency: 'USD', default_margin_percent: 15 } })
  })

  it('a partner code is the next free one, never a random clash', () => {
    expect(nextPartnerCode('Nile Travel', [])).toBe('NIL-001')
    expect(nextPartnerCode('Nile Cruises', ['nil-001', 'NIL-002'])).toBe('NIL-003')
    expect(nextPartnerCode('***', [])).toBe('PTN-001')
  })

  it('a partner with bookings or trips is not deleted', () => {
    const del = src('app/api/b2b/partners/[id]/route.ts')
    expect(del).toMatch(/from\('bookings'\)/)
    expect(del).toMatch(/Deactivate instead/)
  })

  it('the calculator applies the partner\'s default margin', () => {
    const calc = src('app/b2b/calculator/[id]/page.tsx')
    expect(calc).toMatch(/setMarginPercent\(Number\(picked\.default_margin_percent\)\)/)
  })
})
