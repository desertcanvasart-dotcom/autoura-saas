// ============================================
// Who may change a team member's role, and to what
// ============================================
// The role lives on the membership (tenant_members.role — the single source
// since migration 357 dropped user_profiles.role). The Users page sent role
// changes to /api/profiles/[id], which still wrote user_profiles.role: every
// change failed, silently. The rules are the members route's
// (app/api/admin/tenant/members/[id]): owners and admins change roles, only
// an owner makes or unmakes an owner, nobody changes their own.
// Pure: the routes and the tests share it.

import { MEMBERSHIP_ROLES, type MembershipRole } from '@/lib/roles'

export type RoleChangeCheck =
  | { ok: true; role: MembershipRole }
  | { ok: false; status: number; error: string }

export function checkRoleChange(input: {
  callerId: string
  callerRole: string | null | undefined
  targetId: string
  targetRole: string | null | undefined
  newRole: unknown
}): RoleChangeCheck {
  const role = String(input.newRole ?? '') as MembershipRole
  if (!MEMBERSHIP_ROLES.includes(role)) {
    return { ok: false, status: 400, error: `Invalid role. Must be one of: ${MEMBERSHIP_ROLES.join(', ')}` }
  }
  if (!['owner', 'admin'].includes(String(input.callerRole ?? ''))) {
    return { ok: false, status: 403, error: 'Only owners and admins can change roles' }
  }
  if (input.callerId === input.targetId) {
    return { ok: false, status: 400, error: 'You cannot change your own role' }
  }
  if ((role === 'owner' || input.targetRole === 'owner') && input.callerRole !== 'owner') {
    return { ok: false, status: 403, error: 'Only an owner can assign or change the owner role' }
  }
  return { ok: true, role }
}

/**
 * Whether the caller may switch a member's login on or off. Managers could
 * deactivate the owner (locking them out of their own company) and admins
 * themselves; now: owners and admins only, never yourself, and only an owner
 * acts on an owner. Leaving the company with no active owner or admin is
 * checked by the route, which can count them.
 */
export function checkActiveChange(input: {
  callerId: string
  callerRole: string | null | undefined
  targetId: string
  targetRole: string | null | undefined
}): { ok: true } | { ok: false; status: number; error: string } {
  if (!['owner', 'admin'].includes(String(input.callerRole ?? ''))) {
    return { ok: false, status: 403, error: 'Only owners and admins can activate or deactivate users' }
  }
  if (input.callerId === input.targetId) {
    return { ok: false, status: 400, error: 'You cannot deactivate yourself' }
  }
  if (input.targetRole === 'owner' && input.callerRole !== 'owner') {
    return { ok: false, status: 403, error: 'Only an owner can deactivate an owner' }
  }
  return { ok: true }
}
