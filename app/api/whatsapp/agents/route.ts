import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// Who runs the team. Any signed-in account could create team members,
// rewrite one's role or email, or deactivate one (documents audit, round 12).
// Everyone may still flip availability — the inbox's own toggle.
const MANAGER_ROLES = ['owner', 'admin', 'manager']
const isManager = (role: string | null) => MANAGER_ROLES.includes(role || '')
const MANAGER_FIELDS = ['name', 'email', 'phone', 'role', 'is_active', 'is_available', 'max_conversations'] as const
const ANYONE_FIELDS = ['is_available'] as const
const FORBIDDEN = { error: 'Only an owner, admin or manager can change the team.' }

// GET /api/whatsapp/agents - List all team members (for WhatsApp assignment)
export async function GET(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - protects team member data
    const supabase = await createAuthenticatedClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active_only') !== 'false'
    const availableOnly = searchParams.get('available_only') === 'true'

    // `avatar_url:photo_url` is an alias, not a column. team_members.photo_url
    // already holds this; the API keeps the name the UI reads.
    let query = supabase
      .from('team_members')
      .select('id, name, email, phone, avatar_url:photo_url, role, is_active, is_available, max_conversations, created_at, updated_at')
      .order('name', { ascending: true })

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (availableOnly) {
      query = query.eq('is_available', true)
    }

    const { data, error } = await query

    if (error) throw error

    // current_conversations is COUNTED, never stored. A stored counter drifts
    // the moment an assignment changes by any path that forgets to adjust it;
    // this is the same rule the conversation counters follow (recomputed from
    // source, no app-side increments).
    const agents = (data ?? []) as Array<Record<string, unknown>>
    const counts = new Map<string, number>()
    if (agents.length > 0) {
      const { data: open } = await supabase
        .from('whatsapp_conversations')
        .select('assigned_team_member_id')
        .eq('status', 'active')
        .not('assigned_team_member_id', 'is', null)
      for (const row of (open ?? []) as Array<{ assigned_team_member_id: string }>) {
        counts.set(row.assigned_team_member_id, (counts.get(row.assigned_team_member_id) ?? 0) + 1)
      }
    }

    return NextResponse.json({
      success: true,
      agents: agents.map((a) => ({
        ...a,
        current_conversations: counts.get(a.id as string) ?? 0,
      })),
      count: agents.length
    })
  } catch (error: any) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/whatsapp/agents - Create new team member / agent
export async function POST(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - prevents unauthorized agent creation
    // (also resolves tenant_id, which team_members inserts require)
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({
        error: authResult.error
      }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult
    if (!isManager(authResult.role)) return NextResponse.json(FORBIDDEN, { status: 403 })

    const body = await request.json()

    const { name, email, phone, role } = body

    if (!name) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 })
    }

    if (email) {
      const { data: existing } = await supabase
        .from('team_members')
        .select('id')
        .eq('email', email)
        .single()

      if (existing) {
        return NextResponse.json({ error: 'Team member with this email already exists' }, { status: 400 })
      }
    }

    const { data, error } = await supabase
      .from('team_members')
      .insert({
        tenant_id,
        name,
        email: email || null,
        phone: phone || null,
        role: role || 'sales',
        is_active: true
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      agent: data,
      message: 'Agent created successfully'
    })
  } catch (error: any) {
    console.error('Error creating agent:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/whatsapp/agents - Update team member / agent
export async function PATCH(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - prevents unauthorized agent modification
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult

    const body = await request.json()
    const { id, ...requested } = body as Record<string, unknown>

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    // Only the team member's own fields, and only those this role may change:
    // the whole body used to be written, tenant_id and user_id included.
    const allowed: readonly string[] = isManager(authResult.role) ? MANAGER_FIELDS : ANYONE_FIELDS
    const updates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(requested)) {
      if (allowed.includes(key)) updates[key] = value
      else if ((MANAGER_FIELDS as readonly string[]).includes(key)) return NextResponse.json(FORBIDDEN, { status: 403 })
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('team_members')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      agent: data,
      message: 'Agent updated successfully'
    })
  } catch (error: any) {
    console.error('Error updating agent:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/whatsapp/agents - Deactivate agent (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    // ✅ SECURITY: Require authentication - prevents unauthorized agent deactivation
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    if (!isManager(authResult.role)) return NextResponse.json(FORBIDDEN, { status: 403 })
    const { supabase } = authResult

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('team_members')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Agent deactivated successfully'
    })
  } catch (error: any) {
    console.error('Error deactivating agent:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
