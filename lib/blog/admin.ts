// Who may write the product blog: the super admins (SUPER_ADMIN_EMAILS) —
// the blog belongs to the product, not to any tenant. The public pages use
// this to show super admins a way into the editor.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isSuperAdmin } from '@/lib/super-admin-shared'

/** The signed-in user (verified with Supabase), or null. */
export async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: { getAll: () => cookieStore.getAll(), setAll() {} },
    })
    const { data: { user } } = await supabase.auth.getUser()
    return user ? { id: user.id, email: user.email ?? null } : null
  } catch {
    return null
  }
}

export function isBlogAdmin(email: string | null | undefined): boolean {
  return !!email && isSuperAdmin(email)
}
