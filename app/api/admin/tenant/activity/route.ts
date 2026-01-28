import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/admin/tenant/activity
 * Get activity logs for the tenant
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
        error: 'Only owners and admins can view activity logs'
      }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const action_type = searchParams.get('action_type')
    const user_id = searchParams.get('user_id')
    const resource_type = searchParams.get('resource_type')

    // Build query
    let query = supabase
      .from('tenant_activity_logs')
      .select(`
        *,
        user:auth.users(email, raw_user_meta_data)
      `, { count: 'exact' })
      .eq('tenant_id', tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (action_type) {
      query = query.eq('action_type', action_type)
    }

    if (user_id) {
      query = query.eq('user_id', user_id)
    }

    if (resource_type) {
      query = query.eq('resource_type', resource_type)
    }

    const { data: logs, error, count } = await query

    if (error) throw error

    // Format logs with user information
    const formattedLogs = (logs || []).map(log => ({
      id: log.id,
      action_type: log.action_type,
      resource_type: log.resource_type,
      resource_id: log.resource_id,
      details: log.details,
      user_id: log.user_id,
      user_email: log.user?.email || 'System',
      user_name: log.user?.raw_user_meta_data?.full_name || log.user?.raw_user_meta_data?.name || 'System',
      ip_address: log.ip_address,
      user_agent: log.user_agent,
      created_at: log.created_at
    }))

    // Get unique action types for filtering
    const { data: actionTypes } = await supabase
      .from('tenant_activity_logs')
      .select('action_type')
      .eq('tenant_id', tenant_id)

    const uniqueActionTypes = [...new Set((actionTypes || []).map(a => a.action_type))]

    return NextResponse.json({
      success: true,
      logs: formattedLogs,
      total: count || 0,
      limit,
      offset,
      has_more: (count || 0) > offset + limit,
      filters: {
        available_action_types: uniqueActionTypes
      }
    })
  } catch (error: any) {
    console.error('Error fetching activity logs:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
