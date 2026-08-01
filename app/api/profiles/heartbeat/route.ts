import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

/**
 * POST /api/profiles/heartbeat — stamp the caller's last_seen_at and,
 * when the beat is focused, add 5 minutes to today's activity rollup.
 *
 * Called by AuthContext every 5 minutes while a tab is open. The client
 * sends { focused: boolean } — true only when the tab is visible AND the
 * user interacted within the last interval, so background tabs keep
 * last_seen_at roughly honest without accruing focused time. The client
 * skips the beat entirely when hidden-and-idle.
 *
 * Admin client on purpose: user_activity_daily has SELECT-only RLS —
 * clients must not be able to inflate their own minutes — and the write
 * is pinned to the session user's own row either way.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    let focused = false
    try {
      const body = await request.json()
      focused = body?.focused === true
    } catch {
      // No/invalid body (older clients): presence-only beat.
    }

    const adminClient = createAdminClient()
    const now = new Date()
    const nowIso = now.toISOString()

    const { error } = await adminClient
      .from('user_profiles')
      .update({ last_seen_at: nowIso })
      .eq('id', authResult.user.id)

    if (error) throw error

    if (focused) {
      // UTC day bucket (spec open-question #2: tenant-timezone buckets are
      // a possible phase 2; the tenants table has no timezone column yet).
      const day = nowIso.slice(0, 10)
      const { error: rollupError } = await adminClient.rpc(
        'increment_activity_minutes',
        {
          p_tenant_id: authResult.tenant_id,
          p_user_id: authResult.user.id,
          p_day: day,
          p_minutes: 5,
        }
      )
      if (rollupError) throw rollupError
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error recording heartbeat:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to record heartbeat' },
      { status: 500 }
    )
  }
}
