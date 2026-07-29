import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, requireAuth } from '@/lib/supabase-server'
import { resolveTeamMemberIdForUser } from '@/lib/notifications'

// PUT - Mark a notification as read (only the caller's own notifications)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const teamMemberId = await resolveTeamMemberIdForUser(
      auth.supabase!,
      auth.tenant_id!,
      auth.user!.email
    )
    if (!teamMemberId) {
      return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 })
    }

    const { id } = await params
    const body = await request.json()
    const { is_read = true } = body

    const { data, error } = await (createAdminClient() as any)
      .from('notifications')
      .update({ is_read, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('team_member_id', teamMemberId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating notification:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update notification' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a notification (only the caller's own notifications)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const teamMemberId = await resolveTeamMemberIdForUser(
      auth.supabase!,
      auth.tenant_id!,
      auth.user!.email
    )
    if (!teamMemberId) {
      return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 })
    }

    const { id } = await params

    const { error } = await (createAdminClient() as any)
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('team_member_id', teamMemberId)

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Notification deleted' })
  } catch (error) {
    console.error('Error deleting notification:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to delete notification' },
      { status: 500 }
    )
  }
}
