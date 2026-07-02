import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// GET - List all profiles (team members)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
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

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error) {
    console.error('Error fetching profiles:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch profiles' },
      { status: 500 }
    )
  }
}
