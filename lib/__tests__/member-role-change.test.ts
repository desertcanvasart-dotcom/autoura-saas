import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { checkRoleChange } from '@/lib/member-role'

// The Users page's role dropdown wrote user_profiles.role, dropped by
// migration 357: every role change failed, silently. The role is the
// membership's (tenant_members.role).

const src = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')
const base = { callerId: 'me', targetId: 'them', targetRole: 'member' }

describe('who may change a role', () => {
  it('an admin or owner sets a valid role', () => {
    expect(checkRoleChange({ ...base, callerRole: 'admin', newRole: 'manager' })).toEqual({ ok: true, role: 'manager' })
    expect(checkRoleChange({ ...base, callerRole: 'owner', newRole: 'viewer' })).toEqual({ ok: true, role: 'viewer' })
  })

  it('a manager or member may not', () => {
    for (const callerRole of ['manager', 'member', 'viewer', null]) {
      expect(checkRoleChange({ ...base, callerRole, newRole: 'viewer' })).toMatchObject({ ok: false, status: 403 })
    }
  })

  it('nobody changes their own role', () => {
    expect(checkRoleChange({ ...base, callerRole: 'owner', targetId: 'me', newRole: 'viewer' })).toMatchObject({ ok: false, status: 400 })
  })

  it('only an owner makes or unmakes an owner', () => {
    expect(checkRoleChange({ ...base, callerRole: 'admin', newRole: 'owner' })).toMatchObject({ ok: false, status: 403 })
    expect(checkRoleChange({ ...base, callerRole: 'admin', targetRole: 'owner', newRole: 'member' })).toMatchObject({ ok: false, status: 403 })
    expect(checkRoleChange({ ...base, callerRole: 'owner', targetRole: 'owner', newRole: 'admin' })).toEqual({ ok: true, role: 'admin' })
  })

  it('an unknown role is refused', () => {
    expect(checkRoleChange({ ...base, callerRole: 'owner', newRole: 'superuser' })).toMatchObject({ ok: false, status: 400 })
  })
})

describe('the routes', () => {
  it('the profile update writes the role to the membership, never the profile', () => {
    const r = src('app/api/profiles/[id]/route.ts')
    expect(r).toContain('const { is_active: isActive, role: newRole, ...profileUpdate } = updateData')
    expect(r).toContain(".update({ role: check.role })")
    expect(r).toContain("role: member?.role ?? null")
  })

  it('the team list carries each member’s role and filters on it', () => {
    const r = src('app/api/profiles/route.ts')
    expect(r).toContain(".select('user_id, status, role')")
    expect(r).not.toContain("query = query.eq('role', role)")
    expect(r).toContain('role: memberRole.get(p.id) ?? null')
  })

  it('the Users page says why a change was refused', () => {
    expect(src('app/users/page.tsx')).toContain("await dialog.alert('Role not changed'")
  })
})
