import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { parseTeamMemberWrite, teamMemberSaveError } from '@/lib/team/team-member-fields'

// GET - Fetch all team members
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    // 'is_active' accepted as an alias: the resource-assignment picker
    // appends ?is_active=true to every endpoint it consumes.
    const activeOnly = searchParams.get('active') === 'true' || searchParams.get('is_active') === 'true'
    const role = searchParams.get('role')
    // Unified staff identity (mig 288): 'driver', 'guide', etc.
    const staffType = searchParams.get('staff_type')
    const departmentId = searchParams.get('departmentId')

    // Use authenticated client - RLS automatically filters by tenant_id
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    let query = supabase
      .from('team_members')
      .select('*')
      .order('name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (role) {
      query = query.eq('role', role)
    }

    if (departmentId) {
      query = query.eq('department_id', departmentId)
    }

    if (staffType) {
      query = query.eq('staff_type', staffType)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching team members:', error)
      return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in team members GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new team member
export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }
    // The directory is the managers' (People → Team Members); RLS checks only
    // the tenant, so a viewer could deactivate or rename anyone.
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const parsed = parseTeamMemberWrite(await request.json(), 'create')
    if ('error' in parsed) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })

    const { data, error } = await supabase
      .from('team_members')
      .insert({ tenant_id, ...parsed.data, is_active: true } as never)
      .select()
      .single()

    if (error) {
      console.error('Error creating team member:', error)
      return NextResponse.json({ success: false, error: teamMemberSaveError(error) }, { status: error.code === '23505' ? 409 : 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in team members POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}