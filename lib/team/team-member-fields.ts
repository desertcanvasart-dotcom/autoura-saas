// ============================================
// What a Team Members write may set, and how it is checked
// ============================================
// The directory of the people tasks, trips and WhatsApp chats are assigned to
// (team_members) — not logins. Lives here, not in the routes, so it can be
// tested: a Next route file may only export its handlers.

/** Job titles (migration 410). Not login permissions. */
export const TEAM_MEMBER_ROLES = ['owner', 'manager', 'coordinator', 'sales', 'guide', 'driver', 'agent', 'staff', 'viewer'] as const
/** What kind of staff a person is (migration 288): the driver picker lists
 *  drivers, guide and airport/hotel records link to their staff. */
export const TEAM_MEMBER_STAFF_TYPES = ['office', 'guide', 'driver', 'airport_staff', 'hotel_staff'] as const

/** A job title's usual staff type, for a form that has not set one. */
export function staffTypeForRole(role: string | null | undefined): (typeof TEAM_MEMBER_STAFF_TYPES)[number] {
  if (role === 'driver') return 'driver'
  if (role === 'guide') return 'guide'
  return 'office'
}

export type TeamMemberWrite = Partial<{
  name: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  role: string
  staff_type: string
  notes: string | null
  department_id: string | null
  is_active: boolean
}>

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

/**
 * The fields a body sets, checked. `create` requires a name. A blank email,
 * phone or note is stored as nothing (null), never '' — two members with an
 * empty email collided on the per-tenant unique email.
 */
export function parseTeamMemberWrite(body: unknown, mode: 'create' | 'update'): { data: TeamMemberWrite } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Nothing to save' }
  const b = body as Record<string, unknown>
  const data: TeamMemberWrite = {}

  if (b.name !== undefined || mode === 'create') {
    const name = text(b.name)
    if (!name) return { error: 'Name is required' }
    data.name = name
  }
  for (const k of ['email', 'phone', 'whatsapp', 'notes', 'department_id'] as const) {
    if (b[k] !== undefined) data[k] = text(b[k])
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { error: `"${data.email}" is not an email address` }
  if (b.role !== undefined) {
    const role = text(b.role) ?? 'staff'
    if (!(TEAM_MEMBER_ROLES as readonly string[]).includes(role)) return { error: `Role "${role}" is not one of ${TEAM_MEMBER_ROLES.join(', ')}` }
    data.role = role
  }
  if (b.staff_type !== undefined) {
    const st = text(b.staff_type) ?? 'office'
    if (!(TEAM_MEMBER_STAFF_TYPES as readonly string[]).includes(st)) return { error: `Staff type "${st}" is not one of ${TEAM_MEMBER_STAFF_TYPES.join(', ')}` }
    data.staff_type = st
  }
  if (b.is_active !== undefined) {
    if (typeof b.is_active !== 'boolean') return { error: 'Active is true or false' }
    data.is_active = b.is_active
  }
  if (mode === 'create') {
    data.role ??= 'staff'
    data.staff_type ??= staffTypeForRole(data.role)
  }
  return { data }
}

/** A database error as the person saving can act on it. */
export function teamMemberSaveError(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return 'Could not save the team member'
  if (err.code === '23505' && /email/i.test(err.message ?? '')) return 'Another team member already has that email'
  if (err.code === '23514') return 'That role or staff type is not allowed'
  return 'Could not save the team member'
}
