import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import {
  DEACTIVATED_MEMBER_STATUS,
  LEGACY_DEACTIVATED_MEMBER_STATUS,
  INACTIVE_MEMBER_STATUSES,
  isCheckViolation,
  memberIsActive,
} from '@/lib/member-status'

// Verify the target user belongs to the caller's tenant (user_profiles has no tenant_id)
async function isTenantMember(adminClient: any, tenantId: string, userId: string): Promise<boolean> {
  const { data } = await adminClient
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

type AdminClient = ReturnType<typeof createAdminClient>

// This company's membership status for the user (null when unreadable).
async function memberStatus(adminClient: AdminClient, tenantId: string, userId: string): Promise<string | null> {
  const { data } = await adminClient
    .from('tenant_members')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  return data?.status ?? null
}

// Activate / deactivate the user in ONE company. This used to write
// user_profiles.is_active — the account-wide flag middleware enforces — so
// deactivating someone here locked them out of every company they belong to
// (documents audit, round 12). Only this tenant's membership row changes now;
// every membership lookup (requireAuth, middleware) admits status 'active'
// only. Re-activation only lifts a deactivation — it never promotes an
// 'invited' row.
async function setMemberActive(adminClient: AdminClient, tenantId: string, userId: string, active: boolean) {
  const scoped = (status: string) =>
    adminClient
      .from('tenant_members')
      .update({ status })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)

  if (active) {
    const { error } = await scoped('active').in('status', [...INACTIVE_MEMBER_STATUSES])
    if (error) throw error
    return
  }

  const { error } = await scoped(DEACTIVATED_MEMBER_STATUS).eq('status', 'active')
  // Before migration 406 the status CHECK has no 'deactivated': fall back to
  // 'suspended', which the membership lookups refuse just the same.
  if (isCheckViolation(error)) {
    const { error: legacyError } = await scoped(LEGACY_DEACTIVATED_MEMBER_STATUS).eq('status', 'active')
    if (legacyError) throw legacyError
    return
  }
  if (error) throw error
}

// GET - Get single profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params

    const adminClient = createAdminClient()

    if (!(await isTenantMember(adminClient, authResult.tenant_id!, id))) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      )
    }

    const { data, error } = await (adminClient as any)
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error

    // is_active as THIS company sees it (account flag AND membership status).
    const status = await memberStatus(adminClient, authResult.tenant_id!, id)

    return NextResponse.json({
      success: true,
      data: { ...data, is_active: memberIsActive(data?.is_active, status) }
    })
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

// PUT - Update profile
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { id } = await params
    const body = await request.json()

    // Fields that can be updated
    const allowedFields = ['full_name', 'phone', 'role', 'is_active', 'timezone']
    const updateData: Record<string, any> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const isSelf = authResult.user?.id === id
    const isManager = ['owner', 'admin', 'manager'].includes(authResult.role || '')

    if (!isSelf && !isManager) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Privileged fields (role changes, activation) require a manager+ role,
    // even for self-updates (prevents privilege escalation)
    if (!isManager && (updateData.role !== undefined || updateData.is_active !== undefined)) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()

    if (!(await isTenantMember(adminClient, authResult.tenant_id!, id))) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      )
    }

    // is_active is per company: it goes to this tenant's membership row,
    // never to the account-wide user_profiles flag (documents audit, round 12).
    const { is_active: isActive, ...profileUpdate } = updateData
    if (isActive !== undefined) {
      await setMemberActive(adminClient, authResult.tenant_id!, id, isActive === true)
    }

    const profiles = (adminClient as any).from('user_profiles')
    const { data, error } = await (Object.keys(profileUpdate).length > 0
      ? profiles.update(profileUpdate).eq('id', id).select().single()
      : profiles.select().eq('id', id).single())

    if (error) throw error

    const status = await memberStatus(adminClient, authResult.tenant_id!, id)

    return NextResponse.json({
      success: true,
      data: { ...data, is_active: memberIsActive(data?.is_active, status) }
    })
  } catch (error) {
    console.error('Error updating profile:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
