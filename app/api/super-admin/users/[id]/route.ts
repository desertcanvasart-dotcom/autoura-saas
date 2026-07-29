// ============================================
// API: SUPER ADMIN — SINGLE USER MANAGEMENT
// ============================================
//   PATCH  /api/super-admin/users/:id   { action: 'disable' | 'enable' }
//   DELETE /api/super-admin/users/:id   permanent removal
//
// Disable = user_profiles.is_active=false (middleware evicts on page
// routes) PLUS an auth-level ban so sign-in and token refresh stop —
// the flag alone doesn't kill an existing session.
// Delete  = auth.admin.deleteUser; user_profiles + tenant_members cascade,
// audit columns detach via migration 226 (SET NULL / CASCADE sweep).
//
// Guard: accounts listed in SUPER_ADMIN_EMAILS (including the caller's
// own) can never be disabled or deleted through this API.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, isSuperAdmin } from '@/lib/super-admin'

const BAN_FOREVER = '876000h' // ~100 years; auth.admin has no literal "permanent"

async function loadTarget(admin: any, id: string) {
  const { data } = await admin.from('user_profiles').select('id, email, is_active').eq('id', id).maybeSingle()
  return data as { id: string; email: string; is_active: boolean } | null
}

function guardTarget(email: string): string | null {
  if (isSuperAdmin(email)) return 'Super admin accounts cannot be modified through this API.'
  return null
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params

    const body = await request.json()
    if (body.action !== 'disable' && body.action !== 'enable') {
      return NextResponse.json({ success: false, error: "action must be 'disable' or 'enable'." }, { status: 400 })
    }

    const target = await loadTarget(admin, id)
    if (!target) return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 })
    const guard = guardTarget(target.email)
    if (guard) return NextResponse.json({ success: false, error: guard }, { status: 403 })

    const disable = body.action === 'disable'

    // Auth-level ban first: if it fails we haven't half-disabled anyone.
    const { error: banError } = await admin.auth.admin.updateUserById(id, {
      ban_duration: disable ? BAN_FOREVER : 'none',
    })
    if (banError) throw banError

    const { error: profileError } = await admin
      .from('user_profiles')
      .update({ is_active: !disable })
      .eq('id', id)
    if (profileError) throw profileError

    return NextResponse.json({ success: true, data: { id, email: target.email, is_active: !disable } })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin()
    if (auth.error !== null) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    const admin = auth.adminClient!
    const { id } = await params

    const target = await loadTarget(admin, id)
    if (!target) return NextResponse.json({ success: false, error: 'User not found.' }, { status: 404 })
    const guard = guardTarget(target.email)
    if (guard) return NextResponse.json({ success: false, error: guard }, { status: 403 })

    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) throw error

    return NextResponse.json({ success: true, data: { id, email: target.email, deleted: true } })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
