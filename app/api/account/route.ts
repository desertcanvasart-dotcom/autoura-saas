// ============================================
// DELETE /api/account — delete my own login and personal data
// ============================================
// { confirm_email } — the signed-in address typed back is the confirmation.
//
// A company is never left without an owner: someone who is the last owner of
// a company that still has other members must make another owner first, and
// someone who is a company's only member closes the company instead (Settings
// → Company), which deletes their login with it after the 30 days.
//
// Deleting the login cascades to the person's own rows (profile, settings,
// memberships, notifications — migrations' ON DELETE CASCADE); work they did
// for a company stays with the company, with their name unlinked
// (ON DELETE SET NULL). Their Gmail connections are revoked at Google first.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createAuthenticatedClient } from '@/lib/supabase-server'
import { isSuperAdmin } from '@/lib/super-admin-shared'
import { deletionBlocker, type OtherMember } from '@/lib/account/deletion-rules'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest) {
  const { data: { user } } = await (await createAuthenticatedClient()).auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 })
  if (isSuperAdmin(user.email ?? '')) {
    return NextResponse.json({ success: false, error: 'A platform admin account cannot be deleted here.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const typed = typeof body?.confirm_email === 'string' ? body.confirm_email.trim().toLowerCase() : ''
  if (!user.email || typed !== user.email.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Type your email address exactly to confirm.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: memberships, error: readError } = await admin
    .from('tenant_members')
    .select('tenant_id, role, status, tenants(company_name)')
    .eq('user_id', user.id)
  if (readError) return NextResponse.json({ success: false, error: 'Could not check your companies' }, { status: 500 })

  const mine = (memberships ?? []).map(m => ({
    tenant_id: m.tenant_id,
    role: m.role,
    status: m.status,
    company: (m.tenants as { company_name?: string } | null)?.company_name ?? 'your company',
  }))
  const owned = mine.filter(m => m.role === 'owner' && m.status === 'active').map(m => m.tenant_id)
  const othersByTenant = new Map<string, OtherMember[]>()
  if (owned.length) {
    const { data: others, error: othersError } = await admin
      .from('tenant_members')
      .select('tenant_id, role, status')
      .in('tenant_id', owned)
      .neq('user_id', user.id)
    if (othersError) return NextResponse.json({ success: false, error: 'Could not check your companies' }, { status: 500 })
    for (const o of others ?? []) {
      othersByTenant.set(o.tenant_id, [...(othersByTenant.get(o.tenant_id) ?? []), { role: o.role, status: o.status }])
    }
  }
  const block = deletionBlocker(mine, othersByTenant)
  if (block) return NextResponse.json({ success: false, ...block }, { status: 409 })

  const { revokeAndForgetMailbox } = await import('@/lib/gmail-revoke')
  const cleared = await revokeAndForgetMailbox(user.id, null)
  if (cleared.error) console.error('[account] Gmail connections not cleared:', cleared.error)

  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[account] deleting the login failed:', error)
    return NextResponse.json({ success: false, error: 'Your account could not be deleted. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
