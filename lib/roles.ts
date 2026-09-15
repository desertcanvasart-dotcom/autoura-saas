/**
 * The single source of truth for what a person is allowed to do.
 *
 * This app used to carry TWO role columns enforcing different things about the
 * same user:
 *
 *   tenant_members.role  — scoped to one workspace, read by the API routes
 *   user_profiles.role   — one GLOBAL row per account, read by the middleware,
 *                          useRole() and the sidebar
 *
 * Nothing kept them in agreement, and nothing in the application ever wrote the
 * profile one: the Team UI's role change updates the membership only. So a
 * demotion demoted nobody — the routes restricted them, the middleware and
 * sidebar carried on as before. (227 exists because of the mirror-image drift:
 * owners minted with a membership role and no profile role got a stripped
 * sidebar.)
 *
 * The membership role wins, because it is the only one scoped to a workspace —
 * the only one that can still be right when someone belongs to two.
 *
 * NOTE for the middleware: this module must stay dependency-free so it can run
 * in the edge runtime.
 */

/** What tenant_members.role's CHECK constraint permits (migration 002). */
export type MembershipRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer'

/** What ROUTE_PERMISSIONS and the sidebar are written in terms of. */
export type PermissionRole = 'admin' | 'manager' | 'member' | 'viewer'

/** Every value the DB may hold — the test asserts this matches the constraint. */
export const MEMBERSHIP_ROLES: readonly MembershipRole[] = [
  'owner',
  'admin',
  'manager',
  'member',
  'viewer',
] as const

/**
 * Collapse a membership role to a permission role.
 *
 * 'owner' is the whole reason this function exists. ROUTE_PERMISSIONS contains
 * no 'owner' entry anywhere and PermissionRole excludes it, so handing a raw
 * membership role to the middleware would lock every tenant owner out of every
 * restricted route in the workspace they own.
 *
 * Anything unrecognised — a NULL, a role added to the constraint without being
 * added here — collapses to 'viewer'. Failing closed is right for a permission
 * check, and a test keeps that from happening silently.
 */
export function toPermissionRole(role: string | null | undefined): PermissionRole {
  switch (role) {
    case 'owner':
    case 'admin':
      return 'admin'
    case 'manager':
      return 'manager'
    case 'member':
      return 'member'
    default:
      return 'viewer'
  }
}
