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

    // Focused minutes are recorded only while Activity Summaries are on —
    // recorded with it off, switching it on showed managers a month of
    // history nobody had been told about.
    if (focused) {
      const { data: features } = await adminClient
        .from('tenant_features')
        .select('activity_summary_enabled')
        .eq('tenant_id', authResult.tenant_id)
        .maybeSingle()
      if (!features?.activity_summary_enabled) focused = false
    }

    if (focused) {
      // One beat per interval: each POST added 5 minutes, so reloads, extra
      // tabs or a script added hours. A beat within 4.5 minutes of the last
      // credited one adds nothing.
      const { data: lastBeat } = await adminClient
        .from('user_activity_daily')
        .select('last_seen_at')
        .eq('tenant_id', authResult.tenant_id)
        .eq('user_id', authResult.user.id)
        .eq('day', nowIso.slice(0, 10))
        .maybeSingle()
      const last = lastBeat?.last_seen_at ? Date.parse(lastBeat.last_seen_at as string) : 0
      if (last && now.getTime() - last < 270_000) focused = false
    }

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
