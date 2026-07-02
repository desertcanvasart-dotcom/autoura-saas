import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

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

// GET - Get single profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
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

    return NextResponse.json({
      success: true,
      data
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
    if (authResult.error) {
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

    const { data, error } = await (adminClient as any)
      .from('user_profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error updating profile:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
