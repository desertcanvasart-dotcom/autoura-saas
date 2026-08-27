import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { validateDepartmentInput, isNameTaken, findClaimConflict, type ClaimCheckDept } from '@/lib/departments'

const WRITE_ROLES = ['owner', 'admin', 'manager']

/**
 * Fetch a department the caller can see, and decide whether they may write it.
 *
 * Global rows (tenant_id NULL) are readable by every tenant but writable by
 * none — migration 218 enforces that in RLS. Without this check the UPDATE
 * would simply match zero rows and surface as a confusing "not found" or a
 * silent success, so the mismatch is turned into an explicit 403.
 */
async function loadWritableDepartment(
  supabase: NonNullable<Awaited<ReturnType<typeof requireAuth>>['supabase']>,
  id: string
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data, error } = await supabase
    .from('departments')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (error) return { ok: false, error: 'Failed to load department', status: 500 }
  if (!data) return { ok: false, error: 'Department not found', status: 404 }

  const row = data as { id: string; tenant_id: string | null }
  if (row.tenant_id === null) {
    return {
      ok: false,
      error: 'Built-in departments are shared across all tenants and cannot be edited. Create your own instead.',
      status: 403,
    }
  }

  return { ok: true }
}

// PATCH /api/departments/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, role } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }
    if (!WRITE_ROLES.includes(role || '')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }

    const guard = await loadWritableDepartment(supabase, id)
    if (!guard.ok) {
      return NextResponse.json({ success: false, error: guard.error }, { status: guard.status })
    }

    const body = await request.json().catch(() => ({}))
    const validated = validateDepartmentInput(body, { partial: true })
    if (!validated.ok) {
      return NextResponse.json({ success: false, error: validated.error }, { status: 400 })
    }

    if (validated.value.name !== undefined || validated.value.service_types !== undefined) {
      const { data: existing } = await supabase
        .from('departments')
        .select('id, name, service_types, is_active')

      if (
        validated.value.name !== undefined &&
        isNameTaken(validated.value.name, (existing as { id: string; name: string }[]) || [], id)
      ) {
        return NextResponse.json(
          { success: false, error: `A department named "${validated.value.name}" already exists` },
          { status: 409 }
        )
      }

      // One department per routable type — routing is first-match (P6).
      if (validated.value.service_types !== undefined) {
        const conflict = findClaimConflict(validated.value.service_types, (existing as ClaimCheckDept[]) || [], id)
        if (conflict) {
          return NextResponse.json(
            { success: false, error: `"${conflict.type}" is already handled by ${conflict.owner} — one department per service type` },
            { status: 409 }
          )
        }
      }
    }

    const { data, error } = await supabase
      .from('departments')
      .update({ ...validated.value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, tenant_id, name, description, service_types, is_active')
      .single()

    if (error) {
      console.error('Error updating department:', error)
      return NextResponse.json({ success: false, error: 'Failed to update department' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in department PATCH:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/departments/[id]
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
    const { supabase, role } = authResult
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }
    if (!WRITE_ROLES.includes(role || '')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }

    const guard = await loadWritableDepartment(supabase, id)
    if (!guard.ok) {
      return NextResponse.json({ success: false, error: guard.error }, { status: guard.status })
    }

    // team_members.department_id and tasks.department_id are ON DELETE SET
    // NULL (migration 214), so deleting silently un-files staff and tasks
    // rather than failing. Report the counts so the UI can warn first and the
    // response can say what actually happened.
    const [{ count: memberCount }, { count: taskCount }] = await Promise.all([
      supabase.from('team_members').select('id', { count: 'exact', head: true }).eq('department_id', id),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('department_id', id),
    ])

    const { error } = await supabase.from('departments').delete().eq('id', id)

    if (error) {
      console.error('Error deleting department:', error)
      return NextResponse.json({ success: false, error: 'Failed to delete department' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      unfiled: { team_members: memberCount ?? 0, tasks: taskCount ?? 0 },
    })
  } catch (error) {
    console.error('Error in department DELETE:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
