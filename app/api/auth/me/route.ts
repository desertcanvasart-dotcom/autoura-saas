// ============================================
// API: WHO AM I — session + super-admin flag
// ============================================
// GET /api/auth/me -> { authenticated, isSuperAdmin }
// SUPER_ADMIN_EMAILS is server-only env, so the client asks here instead
// of deciding itself. No session is a normal answer, not an error.
// ============================================

import { NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { isConfirmedSuperAdmin } from '@/lib/super-admin-shared'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createAuthenticatedClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
      return NextResponse.json({ success: true, authenticated: false, isSuperAdmin: false })
    }
    return NextResponse.json({
      success: true,
      authenticated: true,
      isSuperAdmin: isConfirmedSuperAdmin(user),
    })
  } catch {
    return NextResponse.json({ success: true, authenticated: false, isSuperAdmin: false })
  }
}
