// ============================================
// Deleting a department without stranding its people and tasks
// ============================================
// team_members.department_id and tasks.department_id are ON DELETE SET NULL
// (migration 214), so a plain delete silently un-filed every member and task
// — the dialog could only warn about it. Now the caller names where they go:
// another department, or explicitly none. They are moved FIRST, then the
// department is deleted.
//
// Its service types go with them when that is possible: the deleted
// department was active, and the target is one of this company's own (a
// built-in department is shared platform-wide and cannot be edited, so the
// types are reported as no longer routed instead — never silently dropped).
//
// No transaction (supabase-js has none), so the steps are ordered to be safe
// to retry: every move is idempotent, the target claims the service types
// before the source disappears, and the delete only runs once the moves
// covered every row that was counted — a move that reached fewer rows (a
// policy, a concurrent write) stops BEFORE anything is lost.

import type { SupabaseClient } from '@supabase/supabase-js'

type Db = SupabaseClient

interface DeptRow {
  id: string
  tenant_id: string | null
  name: string
  service_types: string[] | null
  is_active: boolean | null
}

export type DeleteDepartmentResult =
  | {
      ok: true
      moved: { team_members: number; tasks: number }
      /** Service types the deleted department routed that no department now claims. */
      unrouted: string[]
    }
  | { ok: false; status: 400 | 404 | 409 | 500; error: string }

export async function deleteDepartment(
  db: Db,
  id: string,
  reassignTo: string | null,
  expected: { team_members: number; tasks: number }
): Promise<DeleteDepartmentResult> {
  const { data: source, error: sourceError } = await db
    .from('departments')
    .select('id, tenant_id, name, service_types, is_active')
    .eq('id', id)
    .maybeSingle()
  if (sourceError) throw sourceError
  if (!source) return { ok: false, status: 404, error: 'Department not found' }
  const src = source as DeptRow

  let target: DeptRow | null = null
  if (reassignTo) {
    if (reassignTo === id) {
      return { ok: false, status: 400, error: 'Cannot move members and tasks to the department being deleted' }
    }
    const { data, error } = await db
      .from('departments')
      .select('id, tenant_id, name, service_types, is_active')
      .eq('id', reassignTo)
      .maybeSingle()
    if (error) throw error
    if (!data) return { ok: false, status: 404, error: 'Target department not found' }
    if ((data as DeptRow).is_active === false) {
      return { ok: false, status: 400, error: 'Members and tasks can only be moved to an active department' }
    }
    target = data as DeptRow
  }

  const moveTo = { department_id: target?.id ?? null }
  const [membersRes, tasksRes] = await Promise.all([
    db.from('team_members').update(moveTo).eq('department_id', id).select('id'),
    db.from('tasks').update(moveTo).eq('department_id', id).select('id'),
  ])
  if (membersRes.error) throw membersRes.error
  if (tasksRes.error) throw tasksRes.error
  const moved = { team_members: membersRes.data?.length ?? 0, tasks: tasksRes.data?.length ?? 0 }

  // Every row counted must have moved, or the delete's SET NULL would strand
  // the rest. Nothing is deleted; the moves already made are harmless.
  if (moved.team_members < expected.team_members || moved.tasks < expected.tasks) {
    return {
      ok: false,
      status: 409,
      error: `Only ${moved.team_members} of ${expected.team_members} members and ${moved.tasks} of ${expected.tasks} tasks could be moved — the department was not deleted. Try again.`,
    }
  }

  // An inactive department routed nothing, so it has no types to hand over.
  const owned: string[] = src.is_active === false ? [] : src.service_types ?? []
  let unrouted: string[] = []
  if (owned.length > 0) {
    if (target && target.tenant_id !== null) {
      const merged = [...new Set([...(target.service_types ?? []), ...owned])]
      const { error } = await db
        .from('departments')
        .update({ service_types: merged, updated_at: new Date().toISOString() })
        .eq('id', target.id)
      if (error) throw error
    } else {
      unrouted = [...owned]
    }
  }

  const { error: deleteError } = await db.from('departments').delete().eq('id', id)
  if (deleteError) throw deleteError

  return { ok: true, moved, unrouted }
}
