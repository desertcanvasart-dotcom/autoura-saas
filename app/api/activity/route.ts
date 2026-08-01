import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

const RANGES: Record<string, number> = { today: 1, '7d': 7, '30d': 30 }

/**
 * GET /api/activity — Activity Summary (docs/ACTIVITY-SUMMARY-SPEC.md).
 *
 * No params: the caller's own summary (any role — self-transparency is a
 * product commitment). ?team_member_id=<id>: that directory member's
 * summary, admin/manager only, resolved through team_members.user_id.
 * ?range=today|7d|30d (default 7d).
 *
 * 403 feature_disabled unless tenant_features.activity_summary_enabled.
 * Output counts cover what is per-user attributable today (spec phase 1):
 * tasks completed (assignee), itineraries touched, copilot reviewed/sent.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const adminClient = createAdminClient()
    const { searchParams } = new URL(request.url)
    const range = RANGES[searchParams.get('range') || '7d'] ? (searchParams.get('range') || '7d') : '7d'
    const days = RANGES[range]
    const teamMemberId = searchParams.get('team_member_id')

    // Feature gate
    const { data: features } = await adminClient
      .from('tenant_features')
      .select('activity_summary_enabled')
      .eq('tenant_id', authResult.tenant_id)
      .single()
    if (!features?.activity_summary_enabled) {
      return NextResponse.json(
        { success: false, error: 'feature_disabled' },
        { status: 403 }
      )
    }

    // Resolve the subject
    let subjectUserId: string | null = authResult.user.id
    let subjectTeamMemberId: string | null = null
    if (teamMemberId) {
      const { data: tm, error: tmError } = await adminClient
        .from('team_members')
        .select('id, user_id, tenant_id')
        .eq('id', teamMemberId)
        .eq('tenant_id', authResult.tenant_id)
        .single()
      if (tmError || !tm) {
        return NextResponse.json(
          { success: false, error: 'Team member not found' },
          { status: 404 }
        )
      }
      const isSelf = tm.user_id === authResult.user.id
      const isManager = ['owner', 'admin', 'manager'].includes(authResult.role || '')
      if (!isSelf && !isManager) {
        return NextResponse.json(
          { success: false, error: 'Forbidden' },
          { status: 403 }
        )
      }
      subjectTeamMemberId = tm.id
      subjectUserId = tm.user_id // may be null for directory-only people
    } else {
      // Self: find the caller's directory row for task attribution, if any
      const { data: tm } = await adminClient
        .from('team_members')
        .select('id')
        .eq('tenant_id', authResult.tenant_id)
        .eq('user_id', authResult.user.id)
        .maybeSingle()
      subjectTeamMemberId = tm?.id ?? null
    }

    const startIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const startDay = startIso.slice(0, 10)

    // Presence (login-linked subjects only)
    let presence: {
      last_login_at: string | null
      last_seen_at: string | null
      days: Array<{ day: string; active_minutes: number }>
    } = { last_login_at: null, last_seen_at: null, days: [] }

    if (subjectUserId) {
      const [{ data: authUser }, { data: profile }, { data: rollup }] =
        await Promise.all([
          adminClient.auth.admin.getUserById(subjectUserId),
          adminClient
            .from('user_profiles')
            .select('last_seen_at')
            .eq('id', subjectUserId)
            .maybeSingle(),
          adminClient
            .from('user_activity_daily')
            .select('day, active_minutes')
            .eq('tenant_id', authResult.tenant_id)
            .eq('user_id', subjectUserId)
            .gte('day', startDay)
            .order('day', { ascending: true }),
        ])
      presence = {
        last_login_at: authUser?.user?.last_sign_in_at ?? null,
        last_seen_at: profile?.last_seen_at ?? null,
        days: (rollup || []).map((r) => ({
          day: r.day,
          active_minutes: r.active_minutes,
        })),
      }
    }

    // Output counts (each fail-soft to null rather than failing the request)
    const count = async (fn: () => PromiseLike<{ count: number | null }>) => {
      try {
        const { count: c } = await fn()
        return c ?? 0
      } catch {
        return null
      }
    }

    const [tasksCompleted, itinerariesTouched, copilotReviewed, copilotSent] =
      await Promise.all([
        subjectTeamMemberId
          ? count(() =>
              adminClient
                .from('tasks')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', authResult.tenant_id)
                .eq('assigned_to', subjectTeamMemberId!)
                .eq('status', 'done')
                .gte('completed_at', startIso)
            )
          : Promise.resolve(null),
        subjectUserId
          ? count(() =>
              adminClient
                .from('itineraries')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', authResult.tenant_id)
                .eq('user_id', subjectUserId!)
                .gte('updated_at', startIso)
            )
          : Promise.resolve(null),
        subjectUserId
          ? count(() =>
              adminClient
                .from('communication_drafts')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', authResult.tenant_id)
                .eq('reviewed_by', subjectUserId!)
                .gte('reviewed_at', startIso)
            )
          : Promise.resolve(null),
        subjectUserId
          ? count(() =>
              adminClient
                .from('communication_drafts')
                .select('id', { count: 'exact', head: true })
                .eq('tenant_id', authResult.tenant_id)
                .eq('reviewed_by', subjectUserId!)
                .eq('status', 'sent')
                .gte('sent_at', startIso)
            )
          : Promise.resolve(null),
      ])

    return NextResponse.json({
      success: true,
      data: {
        range,
        presence,
        output: {
          tasks_completed: tasksCompleted,
          itineraries_touched: itinerariesTouched,
          copilot_reviewed: copilotReviewed,
          copilot_sent: copilotSent,
        },
        unattributed_note:
          'Messages, quotes, and invoices are not yet per-user attributed.',
      },
    })
  } catch (error) {
    console.error('Error fetching activity summary:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activity summary' },
      { status: 500 }
    )
  }
}
