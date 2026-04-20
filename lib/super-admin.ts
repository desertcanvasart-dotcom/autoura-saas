// ============================================
// Super Admin Authentication & Helpers
// ============================================
// Super admins are identified by SUPER_ADMIN_EMAILS env var.
// All super admin operations use the admin client (bypasses RLS).

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const isBuildTime = !process.env.NEXT_PUBLIC_SUPABASE_URL

export function isSuperAdmin(email: string): boolean {
  const allowed = process.env.SUPER_ADMIN_EMAILS || ''
  const emails = allowed.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  return emails.includes(email.toLowerCase())
}

export async function requireSuperAdmin() {
  if (isBuildTime) {
    return { error: 'Build time', status: 500, user: null, adminClient: null }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user || !user.email) {
    return { error: 'Unauthorized', status: 401, user: null, adminClient: null }
  }

  if (!isSuperAdmin(user.email)) {
    return { error: 'Forbidden: not a super admin', status: 403, user: null, adminClient: null }
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  return { error: null, status: 200, user, adminClient }
}

// Impersonation cookie name
export const IMPERSONATE_COOKIE = 'x-impersonate-tenant'
