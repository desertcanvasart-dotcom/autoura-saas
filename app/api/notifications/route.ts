import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, requireAuth } from '@/lib/supabase-server'
import { createNotification, resolveTeamMemberIdForUser } from '@/lib/notifications'

// GET - Fetch notifications for the authenticated user's team_member record.
// Scoped server-side to the caller; a client-supplied id is never trusted.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const limit = parseInt(searchParams.get('limit') || '20')

    const teamMemberId = await resolveTeamMemberIdForUser(
      auth.supabase!,
      auth.tenant_id!,
      auth.user!.email
    )

    // No staff record for this user → nothing addressed to them.
    if (!teamMemberId) {
      return NextResponse.json({ success: true, data: [], unreadCount: 0 })
    }

    const admin = createAdminClient() as any

    let query = admin
      .from('notifications')
      .select(`
        *,
        team_member:team_members(id, name, email)
      `)
      .eq('team_member_id', teamMemberId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data, error } = await query

    if (error) {
      // If table doesn't exist, return empty results
      if (error.message?.includes('Could not find the table')) {
        return NextResponse.json({ success: true, data: [], unreadCount: 0 })
      }
      throw error
    }

    const { count: unreadCount } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('team_member_id', teamMemberId)
      .eq('is_read', false)

    return NextResponse.json({
      success: true,
      data,
      unreadCount: unreadCount || 0
    })
  } catch (error: any) {
    console.error('Error fetching notifications:', error)
    if (error.message?.includes('Could not find the table')) {
      return NextResponse.json({ success: true, data: [], unreadCount: 0 })
    }
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}

// POST - Create a notification for a team member in the caller's tenant.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const {
      team_member_id,
      type,
      title,
      message,
      link,
      related_task_id,
      send_email = true
    } = body

    if (!team_member_id || !type || !title) {
      return NextResponse.json(
        { success: false, error: 'team_member_id, type and title are required' },
        { status: 400 }
      )
    }

    // The target team member must belong to the caller's tenant.
    const { data: target } = await auth.supabase!
      .from('team_members')
      .select('id')
      .eq('id', team_member_id)
      .eq('tenant_id', auth.tenant_id!)
      .maybeSingle()

    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Team member not found in your organization' },
        { status: 404 }
      )
    }

    const notification = await createNotification({
      team_member_id,
      type,
      title,
      message,
      link,
      related_task_id,
      send_email,
    })

    return NextResponse.json({ success: true, data: notification })
  } catch (error) {
    console.error('Error creating notification:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create notification' },
      { status: 500 }
    )
  }
}

// Notification types reference:
// - task_assigned: New task assigned
// - task_due_soon: Task due soon reminder
// - task_overdue: Task is overdue
// - task_completed: Task was completed
// - whatsapp_assigned: WhatsApp conversation assigned
// - whatsapp_new_message: New message in assigned chat