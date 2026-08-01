import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { createNotification } from '@/lib/notifications'

/**
 * POST /api/settings/activity-summary — enable/disable the Activity
 * Summary feature for the tenant. Admin only.
 *
 * Enabling requires { confirmed_informed: true } — the admin attests the
 * team knows (transparency commitment, docs/ACTIVITY-SUMMARY-SPEC.md) —
 * and notifies every active directory member in-app.
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
    if (!['owner', 'admin'].includes(authResult.role || '')) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const enabled = body?.enabled === true
    if (enabled && body?.confirmed_informed !== true) {
      return NextResponse.json(
        { success: false, error: 'Confirm that your team has been informed' },
        { status: 400 }
      )
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient
      .from('tenant_features')
      .update({ activity_summary_enabled: enabled })
      .eq('tenant_id', authResult.tenant_id)
    if (error) throw error

    // In-app notice to every active directory member on enable (fail-soft:
    // the toggle result must not depend on notification delivery).
    let notified = 0
    if (enabled) {
      try {
        const { data: members } = await adminClient
          .from('team_members')
          .select('id')
          .eq('tenant_id', authResult.tenant_id)
          .eq('is_active', true)
        for (const m of members || []) {
          try {
            await createNotification({
              team_member_id: m.id,
              type: 'system',
              title: 'Activity summaries are on for this workspace',
              message:
                'Your admin enabled Activity Summaries. Your in-app activity (focused time and work counts) is visible to admins, managers, and yourself.',
              send_email: false,
            })
            notified++
          } catch {
            // fail-soft per member
          }
        }
      } catch (e) {
        console.error('Activity summary enable notifications failed:', e)
      }
    }

    return NextResponse.json({ success: true, enabled, notified })
  } catch (error) {
    console.error('Error toggling activity summary:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update setting' },
      { status: 500 }
    )
  }
}
