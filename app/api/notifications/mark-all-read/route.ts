import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, requireAuth } from '@/lib/supabase-server'
import { resolveTeamMemberIdForUser } from '@/lib/notifications'

// PUT - Mark all of the authenticated user's notifications as read
export async function PUT(_request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const teamMemberId = await resolveTeamMemberIdForUser(
      auth.supabase!,
      auth.tenant_id!,
      auth.user!.email
    )
    if (!teamMemberId) {
      return NextResponse.json({ success: true, message: '0 notifications marked as read', count: 0 })
    }

    const { data, error } = await (createAdminClient() as any)
      .from('notifications')
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq('team_member_id', teamMemberId)
      .eq('is_read', false)
      .select()

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0} notifications marked as read`,
      count: data?.length || 0
    })
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to mark notifications as read' },
      { status: 500 }
    )
  }
}
