import { NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

/**
 * POST /api/profiles/heartbeat — stamp the caller's last_seen_at.
 *
 * Called by AuthContext every 5 minutes while a tab is open (and once on
 * session start), so last_seen_at reads as "active until about then".
 * Admin client: user_profiles has no self-update RLS path for this
 * column and the write is pinned to the session user's own row anyway.
 */
export async function POST() {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { error } = await createAdminClient()
      .from('user_profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', authResult.user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error recording heartbeat:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to record heartbeat' },
      { status: 500 }
    )
  }
}
