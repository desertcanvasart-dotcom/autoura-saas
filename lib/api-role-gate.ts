// ============================================
// Who may change what, at the API
// ============================================
// The pages hide what a role cannot do, but a hidden button is not a lock:
// these routes answered anyone signed in to the tenant. Two levels, the
// same as the sidebar's:
//   staff  — owner, admin, manager, member: everyday sales work
//   manage — owner, admin, manager: money, partners and B2B pricing
//   admin  — owner, admin: settings-level tools (the Capacity Calendar)
// Viewers read only.

import { NextResponse } from 'next/server'

export const STAFF_ROLES = ['owner', 'admin', 'manager', 'member'] as const
export const MANAGE_ROLES = ['owner', 'admin', 'manager'] as const
export const ADMIN_ROLES = ['owner', 'admin'] as const

export type RoleLevel = 'staff' | 'manage' | 'admin'

export function roleAllows(role: string | null | undefined, level: RoleLevel): boolean {
  const allowed: readonly string[] = level === 'admin' ? ADMIN_ROLES : level === 'manage' ? MANAGE_ROLES : STAFF_ROLES
  return allowed.includes(role || '')
}

/** A 403 when `role` falls short of `level`, else null. */
export function roleDenied(role: string | null | undefined, level: RoleLevel): NextResponse | null {
  if (roleAllows(role, level)) return null
  return NextResponse.json(
    {
      success: false,
      error: level === 'admin'
        ? 'Only admins can do this.'
        : level === 'manage'
          ? 'Only managers and admins can do this.'
          : 'Your role can view this but not change it.',
    },
    { status: 403 },
  )
}

/**
 * For a route that relies on RLS and never reads the caller's role: signs
 * them in, and answers 401 / 403 when they may not go on, else null.
 */
export async function gateRole(level: RoleLevel): Promise<NextResponse | null> {
  const { requireAuth } = await import('@/lib/supabase-server')
  const auth = await requireAuth()
  if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  return roleDenied(auth.role, level)
}
