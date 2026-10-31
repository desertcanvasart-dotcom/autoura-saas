import { NextResponse } from 'next/server'
import { createAdminClient, requireAuth } from '@/lib/supabase-server'
import { myNotificationsFilter } from '@/lib/notifications'

// DELETE - Delete all of the authenticated user's notifications, in one
// request. Scoped exactly as mark-all-read and the single DELETE are: only
// rows addressed to this login or its staff record. The bell used to delete
// the ten it had loaded one request at a time, ignoring failures, so older
// notifications came back on the next poll.
export async function DELETE() {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const mine = await myNotificationsFilter(auth.supabase!, auth.tenant_id!, auth.user!)

    const { data, error } = await createAdminClient()
      .from('notifications')
      .delete()
      .or(mine)
      .select('id')

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0} notifications deleted`,
      count: data?.length || 0
    })
  } catch (error) {
    console.error('Error clearing notifications:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to clear notifications' },
      { status: 500 }
    )
  }
}
