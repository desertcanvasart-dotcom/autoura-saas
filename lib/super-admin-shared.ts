// ============================================
// Super admin email check — import-safe everywhere
// ============================================
// Extracted from lib/super-admin.ts so the middleware (edge runtime) and
// API routes can share the check without pulling in next/headers or the
// Supabase server client. Keep this file dependency-free.

export function isSuperAdmin(email: string): boolean {
  const allowed = process.env.SUPER_ADMIN_EMAILS || ''
  const emails = allowed.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return emails.includes(email.toLowerCase())
}

/**
 * A signed-in account that holds super-admin power: on the allowlist AND with
 * its address confirmed. The allowlist names an ADDRESS, and an account can
 * carry an address its holder has never proven (an unconfirmed sign-up, or
 * one made from an invitation link someone else opened) — that account must
 * never be the platform owner.
 */
export function isConfirmedSuperAdmin(
  user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined,
): boolean {
  return !!user?.email && !!user.email_confirmed_at && isSuperAdmin(user.email)
}
