import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { logActivity, checkLimit } from '@/lib/billing-middleware'

/**
 * GET /api/admin/tenant/members
 * List all team members for the authenticated user's tenant
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id, user } = authResult
    if (!supabase || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // Check if user has admin access
    const { data: currentMember } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
      .single()

    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json({
        success: false,
        error: 'Only owners and admins can view team members'
      }, { status: 403 })
    }

    // Get all members
    const { data: members, error } = await supabase
      .from('tenant_members')
      .select('*')
      .eq('tenant_id', tenant_id)
      .order('joined_at', { ascending: false })

    if (error) throw error

    // Format response
    const formattedMembers = (members || []).map((member: any) => ({
      id: member.id,
      user_id: member.user_id,
      email: member.email || 'N/A',
      name: member.name || 'Unknown',
      avatar_url: null,
      role: member.role,
      joined_at: member.joined_at
    }))

    return NextResponse.json({
      success: true,
      members: formattedMembers,
      count: formattedMembers.length
    })
  } catch (error: any) {
    console.error('Error fetching team members:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
