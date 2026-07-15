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
