import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

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

    // user_profiles has no tenant_id — scope via tenant_members membership
    const { data: members, error: membersError } = await (adminClient as any)
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', authResult.tenant_id)

    if (membersError) throw membersError

    const memberIds = (members || []).map((m: any) => m.user_id)

    let query = (adminClient as any)
      .from('user_profiles')
      .select('*')
      .in('id', memberIds)
      .order('created_at', { ascending: false })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (role) {
      query = query.eq('role', role)
    }

    const { data, error } = await query

    if (error) throw error

    // Last login comes from Supabase's own auth record (last_sign_in_at) —
    // user_profiles never had a real last_login_at column; the UI field of
    // that name rendered nothing until this enrichment.
    let lastSignIn = new Map<string, string | null>()
    try {
      const { data: authUsers } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })
      lastSignIn = new Map(
        (authUsers?.users || []).map((u) => [u.id, u.last_sign_in_at ?? null])
      )
    } catch (e) {
      // Enrichment only — the member list must not fail because of it.
      console.error('Error fetching auth last_sign_in_at:', e)
    }

    const enriched = (data || []).map((p: any) => ({
      ...p,
      last_login_at: lastSignIn.get(p.id) ?? null,
    }))

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
