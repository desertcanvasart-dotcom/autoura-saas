import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// Update team member role
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, role: userRole } = authResult
    const adminClient = createAdminClient()

    // Only admins and owners can update roles
    if (!['owner', 'admin'].includes(userRole || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { role: newRole, status: newStatus } = body

    // Build update object
    const updates: any = { updated_at: new Date().toISOString() }

    if (newRole) {
      if (!['admin', 'manager', 'member', 'viewer'].includes(newRole)) {
        return NextResponse.json(
          { success: false, error: 'Invalid role' },
          { status: 400 }
        )
      }
      updates.role = newRole
    }

    if (newStatus) {
      if (!['active', 'invited', 'suspended'].includes(newStatus)) {
        return NextResponse.json(
          { success: false, error: 'Invalid status' },
          { status: 400 }
        )
      }
      updates.status = newStatus
    }

    if (!newRole && !newStatus) {
      return NextResponse.json(
        { success: false, error: 'No update fields provided' },
        { status: 400 }
      )
    }

    // Update the member
    const { error } = await adminClient
      .from('tenant_members')
      .update(updates)
      .eq('id', params.id)
      .eq('tenant_id', tenant_id) // Ensure member belongs to same tenant

    if (error) {
      console.error('Error updating member role:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update member role' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Member role updated successfully'
    })
  } catch (error) {
    console.error('Error in team member PATCH:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Remove team member
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, role: userRole } = authResult
    const adminClient = createAdminClient()

    // Only admins and owners can remove members
    if (!['owner', 'admin'].includes(userRole || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Delete the member
    const { error } = await adminClient
      .from('tenant_members')
      .delete()
      .eq('id', params.id)
      .eq('tenant_id', tenant_id) // Ensure member belongs to same tenant

    if (error) {
      console.error('Error removing member:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to remove member' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Member removed successfully'
    })
  } catch (error) {
    console.error('Error in team member DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
