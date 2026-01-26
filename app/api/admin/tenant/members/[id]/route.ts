import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { logActivity } from '@/lib/billing-middleware'

/**
 * PATCH /api/admin/tenant/members/[id]
 * Update a team member's role
 */
export async function PATCH(
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

    const { supabase, tenant, user } = authResult
    const { id } = await params

    // Check if user has admin access
    const { data: currentMember } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .single()

    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json({
        success: false,
        error: 'Only owners and admins can update team members'
      }, { status: 403 })
    }

    const body = await request.json()
    const { role } = body

    if (!role || !['owner', 'admin', 'manager', 'member', 'viewer'].includes(role)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid role. Must be one of: owner, admin, manager, member, viewer'
      }, { status: 400 })
    }

    // Get the member being updated
    const { data: targetMember, error: fetchError } = await supabase
      .from('tenant_members')
      .select('*, user:auth.users!inner(email)')
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .single()

    if (fetchError || !targetMember) {
      return NextResponse.json({
        success: false,
        error: 'Team member not found'
      }, { status: 404 })
    }

    // Prevent non-owners from creating/modifying owners
    if (role === 'owner' && currentMember.role !== 'owner') {
      return NextResponse.json({
        success: false,
        error: 'Only owners can assign the owner role'
      }, { status: 403 })
    }

    // Prevent users from modifying their own role
    if (targetMember.user_id === user.id) {
      return NextResponse.json({
        success: false,
        error: 'You cannot change your own role'
      }, { status: 400 })
    }

    const old_role = targetMember.role

    // Update the role
    const { data: updatedMember, error: updateError } = await supabase
      .from('tenant_members')
      .update({ role })
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    // Log activity
    await logActivity(
      tenant.id,
      user.id,
      'team.member_role_changed',
      supabase,
      {
        resourceType: 'tenant_member',
        resourceId: id,
        details: {
          member_email: targetMember.user?.email,
          old_role,
          new_role: role
        }
      }
    )

    return NextResponse.json({
      success: true,
      member: updatedMember,
      message: 'Team member role updated successfully'
    })
  } catch (error: any) {
    console.error('Error updating team member:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/tenant/members/[id]
 * Remove a team member from the tenant
 */
export async function DELETE(
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

    const { supabase, tenant, user } = authResult
    const { id } = await params

    // Check if user has admin access
    const { data: currentMember } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .single()

    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json({
        success: false,
        error: 'Only owners and admins can remove team members'
      }, { status: 403 })
    }

    // Get the member being removed
    const { data: targetMember, error: fetchError } = await supabase
      .from('tenant_members')
      .select('*, user:auth.users!inner(email)')
      .eq('id', id)
      .eq('tenant_id', tenant.id)
      .single()

    if (fetchError || !targetMember) {
      return NextResponse.json({
        success: false,
        error: 'Team member not found'
      }, { status: 404 })
    }

    // Prevent removing the last owner
    if (targetMember.role === 'owner') {
      const { count } = await supabase
        .from('tenant_members')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('role', 'owner')

      if (count && count <= 1) {
        return NextResponse.json({
          success: false,
          error: 'Cannot remove the last owner. Assign another owner first.'
        }, { status: 400 })
      }
    }

    // Prevent users from removing themselves
    if (targetMember.user_id === user.id) {
      return NextResponse.json({
        success: false,
        error: 'You cannot remove yourself. Ask another admin to remove you.'
      }, { status: 400 })
    }

    // Delete the member
    const { error: deleteError } = await supabase
      .from('tenant_members')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError

    // Log activity
    await logActivity(
      tenant.id,
      user.id,
      'team.member_removed',
      supabase,
      {
        resourceType: 'tenant_member',
        resourceId: id,
        details: {
          member_email: targetMember.user?.email,
          member_role: targetMember.role
        }
      }
    )

    return NextResponse.json({
      success: true,
      message: 'Team member removed successfully'
    })
  } catch (error: any) {
    console.error('Error removing team member:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
