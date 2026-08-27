import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { validateDepartmentInput, isNameTaken, findClaimConflict, type ClaimCheckDept } from '@/lib/departments'

/** Roles allowed to change the department list (reads are open to any member). */
const WRITE_ROLES = ['owner', 'admin', 'manager']

// GET /api/departments
// List departments (tenant-aware via RLS: the caller's own rows plus the
// global, migration-seeded ones). Active-only by default so existing callers —
// the task generator and the team-members pickers — keep their behaviour;
// ?includeInactive=true is for the settings editor, which has to show
// deactivated rows in order to reactivate them.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true'

    let query = supabase
      .from('departments')
      .select('id, tenant_id, name, description, service_types, is_active')
      .order('name')

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      // Table may not exist yet — return empty
      console.error('Error fetching departments:', error)
      return NextResponse.json({ success: true, data: [] })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Error in departments GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/departments
// Create a department owned by the caller's tenant.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id, role } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }
    if (!WRITE_ROLES.includes(role || '')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const validated = validateDepartmentInput(body)
    if (!validated.ok) {
      return NextResponse.json({ success: false, error: validated.error }, { status: 400 })
    }

    // Compare against global rows too, not just the tenant's own — see the
    // note on isNameTaken for why the DB's unique index isn't enough.
    const { data: existing } = await supabase
      .from('departments')
      .select('id, name, service_types, is_active')

    if (isNameTaken(validated.value.name, (existing as { id: string; name: string }[]) || [])) {
      return NextResponse.json(
        { success: false, error: `A department named "${validated.value.name}" already exists` },
        { status: 409 }
      )
    }

    // One department per routable type: routing is first-match, so a double
    // claim would silently win by load order (P6).
    const conflict = findClaimConflict(validated.value.service_types ?? [], (existing as ClaimCheckDept[]) || [])
    if (conflict) {
      return NextResponse.json(
        { success: false, error: `"${conflict.type}" is already handled by ${conflict.owner} — one department per service type` },
        { status: 409 }
      )
    }

    // tenant_id is set from the session, never from the body: RLS's WITH CHECK
    // requires tenant_id = get_user_tenant_id(), so a tenant cannot mint a
    // global (NULL-tenant) department that every other tenant would then read.
    const { data, error } = await supabase
      .from('departments')
      .insert({ ...validated.value, tenant_id })
      .select('id, tenant_id, name, description, service_types, is_active')
      .single()

    if (error) {
      console.error('Error creating department:', error)
      return NextResponse.json({ success: false, error: 'Failed to create department' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Error in departments POST:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
