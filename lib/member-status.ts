// ============================================
// Per-company staff activation (documents audit, round 12)
// ============================================
// "Deactivate" on the Team page used to flip user_profiles.is_active — one
// flag for the whole ACCOUNT, which middleware enforces on every company the
// person belongs to. Deactivating someone in your company locked them out of
// every other company too. A company's deactivation now lives on its own
// tenant_members row; user_profiles.is_active stays the platform-level switch
// (super-admin "disable user").
//
// 'deactivated' (migration 406) is its own status so a super admin
// re-activating a suspended TENANT (which flips 'suspended' -> 'active')
// does not quietly revive staff the company deactivated. Until 406 has run
// the status CHECK refuses it and we fall back to 'suspended', which every
// membership lookup (status = 'active') already refuses the same way.

export const DEACTIVATED_MEMBER_STATUS = 'deactivated'
export const LEGACY_DEACTIVATED_MEMBER_STATUS = 'suspended'

// Membership statuses that mean "this company has switched the person off".
export const INACTIVE_MEMBER_STATUSES: readonly string[] = [
  DEACTIVATED_MEMBER_STATUS,
  LEGACY_DEACTIVATED_MEMBER_STATUS,
]

// The is_active the Team page shows for one member of THIS company: off when
// the platform disabled the account, or when this company deactivated them.
export function memberIsActive(
  profileIsActive: boolean | null | undefined,
  memberStatus: string | null | undefined
): boolean {
  if (profileIsActive === false) return false
  return !INACTIVE_MEMBER_STATUSES.includes(memberStatus ?? '')
}

// Postgres check_violation — the status CHECK before migration 406.
export function isCheckViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23514'
}
