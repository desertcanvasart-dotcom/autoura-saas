import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { memberIsActive } from '@/lib/member-status'
import { roleAllows } from '@/lib/api-role-gate'

// GET - List all profiles (team members)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'
    const role = searchParams.get('role')

    const adminClient = createAdminClient()

    // When colleagues were last seen and last signed in is for managers and
    // admins — it went to every member, viewers too. Last seen is activity
    // data, so it also needs Activity Summaries on (it was shown regardless).
    const canSeeLogins = roleAllows(authResult.role, 'manage')
    let activityOn = false
    if (canSeeLogins) {
      const { data: features } = await (adminClient as any)
        .from('tenant_features')
        .select('activity_summary_enabled')
        .eq('tenant_id', authResult.tenant_id)
        .maybeSingle()
      activityOn = !!features?.activity_summary_enabled
    }

    // user_profiles has no tenant_id — scope via tenant_members membership
    const { data: members, error: membersError } = await (adminClient as any)
      .from('tenant_members')
      .select('user_id, status, role')
      .eq('tenant_id', authResult.tenant_id)

    if (membersError) throw membersError

    // The role is this company's (tenant_members.role): user_profiles.role
    // was dropped by migration 357, so the list carried no role and the role
    // filter errored.
    const memberRole = new Map<string, string | null>(
      (members || []).map((m: { user_id: string; role: string | null }) => [m.user_id, m.role])
    )
    const memberIds = (members || [])
      .filter((m: { role: string | null }) => !role || m.role === role)
      .map((m: { user_id: string }) => m.user_id)
    // Deactivation is per company — it lives on the membership row, not on
    // the account-wide user_profiles.is_active (documents audit, round 12).
    const memberStatus = new Map<string, string>(
      (members || []).map((m: { user_id: string; status: string }) => [m.user_id, m.status])
    )

    let query = (adminClient as any)
      .from('user_profiles')
      .select('*')
      .in('id', memberIds)
      .order('created_at', { ascending: false })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) throw error

    // Last login comes from Supabase's own auth record (last_sign_in_at) —
    // user_profiles never had a real last_login_at column; the UI field of
    // that name rendered nothing until this enrichment.
    // Each member looked up by id: one listUsers page of 1000 covered the
    // whole platform, so past 1000 accounts most members showed no login.
    let lastSignIn = new Map<string, string | null>()
    try {
      if (canSeeLogins) {
        const ids: string[] = (data || []).map((p: { id: string }) => p.id)
        const found = await Promise.all(ids.map(async (uid) => {
          const { data: u } = await adminClient.auth.admin.getUserById(uid)
          return [uid, u?.user?.last_sign_in_at ?? null] as [string, string | null]
        }))
        lastSignIn = new Map(found)
      }
    } catch (e) {
      // Enrichment only — the member list must not fail because of it.
      console.error('Error fetching auth last_sign_in_at:', e)
    }

    const enriched = (data || [])
      .map((p: any) => ({
        ...p,
        last_seen_at: canSeeLogins && activityOn ? p.last_seen_at ?? null : null,
        role: memberRole.get(p.id) ?? null,
        is_active: memberIsActive(p.is_active, memberStatus.get(p.id)),
        last_login_at: canSeeLogins ? lastSignIn.get(p.id) ?? null : null,
      }))
      .filter((p: { is_active: boolean }) => !activeOnly || p.is_active)

    return NextResponse.json({
      success: true,
      data: enriched
    })
  } catch (error) {
    console.error('Error fetching profiles:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profiles' },
      { status: 500 }
    )
  }
}
