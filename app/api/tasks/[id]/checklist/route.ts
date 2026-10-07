import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import {
  applyChecklistChange,
  statusFromChecklist,
  type ChecklistChange,
  type ChecklistItem,
} from '@/lib/tasks/itinerary-tasks'
import type { Json } from '@/types/database.types'

// PATCH /api/tasks/[id]/checklist — change one row of a generated task's
// checklist: tick/untick it as booked, set its confirmation number, or (for a
// row that left the itinerary after it was booked) confirm the booking was
// cancelled. The task's status follows the rows (statusFromChecklist).
//
// Body: { key, booked } | { key, confirmation } | { key, cancelled: true }
//
// Two people ticking different rows at once must not lose either tick, and
// the checklist is one JSON column, so the write only lands if the row is
// unchanged since it was read (updated_at) — otherwise it re-reads and
// re-applies.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase } = auth

    const { id } = await params
    const body = await request.json().catch(() => null)
    const change = parseChange(body)
    if (!change) {
      return NextResponse.json({ success: false, error: 'Expected { key, booked } | { key, confirmation } | { key, cancelled: true }' }, { status: 400 })
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: task, error: readError } = await supabase
        .from('tasks')
        .select('id, status, checklist, updated_at')
        .eq('id', id)
        .maybeSingle()
      if (readError) throw readError
      if (!task) return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
      if (!Array.isArray(task.checklist)) {
        return NextResponse.json({ success: false, error: 'This task has no checklist' }, { status: 400 })
      }

      const now = new Date().toISOString()
      const next = applyChecklistChange(task.checklist as unknown as ChecklistItem[], change, now)
      if (!next) return NextResponse.json({ success: false, error: 'Checklist row not found' }, { status: 404 })

      const status = statusFromChecklist(next, task.status)
      const fields: { checklist: Json; status: string; updated_at: string; completed_at?: string | null } = {
        checklist: next as unknown as Json,
        status,
        updated_at: now,
      }
      if (status === 'done' && task.status !== 'done') fields.completed_at = now
      if (status !== 'done') fields.completed_at = null

      let query = supabase.from('tasks').update(fields).eq('id', id)
      query = task.updated_at ? query.eq('updated_at', task.updated_at) : query.is('updated_at', null)
      const { data: updated, error } = await query
        .select('*, assigned_member:team_members!tasks_assigned_to_fkey(id, name, email, role)')
        .maybeSingle()
      if (error) throw error
      if (updated) return NextResponse.json({ success: true, data: updated })
      // Someone else wrote in between — read again and re-apply.
    }

    return NextResponse.json({ success: false, error: 'The task is being changed by someone else — try again' }, { status: 409 })
  } catch (error) {
    console.error('Error in task checklist PATCH:', error)
    return NextResponse.json({ success: false, error: 'Failed to update checklist' }, { status: 500 })
  }
}

function parseChange(body: unknown): ChecklistChange | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.key !== 'string' || !b.key) return null
  if (typeof b.booked === 'boolean') return { key: b.key, booked: b.booked }
  if (b.cancelled === true) return { key: b.key, cancelled: true }
  if ('confirmation' in b && (typeof b.confirmation === 'string' || b.confirmation === null)) {
    return { key: b.key, confirmation: b.confirmation as string | null }
  }
  return null
}
