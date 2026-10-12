import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { parseTeamMemberWrite, teamMemberSaveError } from '@/lib/team/team-member-fields'

// GET - Fetch single team member
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching team member:', error)
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in team member GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update team member
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const parsed = parseTeamMemberWrite(await request.json(), 'update')
    if ('error' in parsed) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    const updateData: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() }

    // A changed email is a different person's: drop the old login link so
    // the link trigger (migration 265) finds the new address's login, if any.
    // It kept the old user_id — the badge, and the old person's activity.
    if (parsed.data.email !== undefined) {
      const { data: current } = await supabase.from('team_members').select('email').eq('id', id).eq('tenant_id', tenant_id).maybeSingle()
      const before = (current as { email?: string | null } | null)?.email ?? null
      if ((before ?? '').toLowerCase() !== (parsed.data.email ?? '').toLowerCase()) updateData.user_id = null
    }

    const { data, error } = await supabase
      .from('team_members')
      .update(updateData as never)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select()
      .maybeSingle()

    if (error) {
      console.error('Error updating team member:', error)
      return NextResponse.json({ success: false, error: teamMemberSaveError(error) }, { status: error.code === '23505' ? 409 : 500 })
    }
    if (!data) return NextResponse.json({ success: false, error: 'Team member not found' }, { status: 404 })

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in team member PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete team member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult

    // Soft delete - just mark as inactive (tasks keep their assignee)
    const { error } = await supabase
      .from('team_members')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenant_id)

    if (error) {
      console.error('Error deleting team member:', error)
      return NextResponse.json({ error: 'Failed to delete team member' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in team member DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}