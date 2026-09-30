import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { createNotification } from '@/lib/notifications'
import {
  planItineraryTasks,
  planSync,
  type ExistingGeneratedTask,
  type ServiceForTasks,
  type TaskAction,
} from '@/lib/tasks/itinerary-tasks'
import type { Json } from '@/types/database.types'

// POST — generate (or re-sync) the itinerary's operations tasks: one per
// service category, built from its services and days by plain code
// (lib/tasks/itinerary-tasks.ts). This replaces the AI generator, which
// wrote different tasks on every run and duplicated them on the second.
//
// Body: { assignments?: { [departmentId]: teamMemberId }, dry_run?: boolean,
//         today?: 'YYYY-MM-DD' }
// dry_run returns what WOULD happen — the dialog shows it before anything is
// written. `today` is the caller's local date (the server runs in UTC); a
// due date already past becomes today.
//
// Everything reads and writes through the caller's client, so RLS keeps it
// to their own company.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }
    const { supabase, tenant_id } = auth

    const { id: itineraryId } = await params
    const body: Record<string, unknown> = await request.json().catch(() => ({}))
    const dryRun = body.dry_run === true
    const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
      ? body.today
      : new Date().toISOString().slice(0, 10)
    const requested: Record<string, string> = {}
    if (body.assignments && typeof body.assignments === 'object') {
      for (const [dept, member] of Object.entries(body.assignments as Record<string, unknown>)) {
        if (typeof member === 'string' && member) requested[dept] = member
      }
    }

    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, client_name, trip_name, start_date, end_date, num_adults, num_children, num_infants')
      .eq('id', itineraryId)
      .maybeSingle()
    if (itinError) throw itinError
    if (!itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      // Everything a day says it needs — night, flight, guide, sites — so a
      // need with no priced service still becomes a row.
      .select('id, day_number, date, city, overnight_city, day_type, is_departure, is_cruise_day, is_sailing_day, accommodation_type, hotel_included, overnight, transport_type, intercity, flight_from, flight_to, guide_required, has_sightseeing, attractions')
      .eq('itinerary_id', itineraryId)
      .order('day_number')
    if (daysError) throw daysError
    if (!days?.length) {
      return NextResponse.json({ success: false, error: 'This itinerary has no days yet' }, { status: 400 })
    }

    const [servicesRes, departmentsRes, existingRes] = await Promise.all([
      supabase
        .from('itinerary_services')
        .select('itinerary_day_id, day_id, service_type, service_name, description, quantity, notes, supplier_name')
        .in('itinerary_day_id', days.map(d => d.id)),
      // Active only: a department switched off gets no tasks at all.
      supabase
        .from('departments')
        .select('id, name, service_types')
        .eq('is_active', true)
        .order('created_at'),
      supabase
        .from('tasks')
        .select('id, service_type, status, archived, assigned_to, generation_snapshot, checklist')
        .eq('linked_type', 'itinerary')
        .eq('linked_id', itineraryId)
        .order('created_at'),
    ])
    if (servicesRes.error) throw servicesRes.error
    if (departmentsRes.error) throw departmentsRes.error
    if (existingRes.error) throw existingRes.error

    const dayById = new Map(days.map(d => [d.id, d]))
    const services: ServiceForTasks[] = []
    for (const s of servicesRes.data ?? []) {
      const day = dayById.get(s.itinerary_day_id ?? s.day_id ?? '')
      if (!day) continue
      services.push({
        day_number: day.day_number,
        date: day.date,
        city: day.city,
        overnight_city: day.overnight_city,
        service_type: s.service_type,
        service_name: s.service_name,
        description: s.description,
        quantity: s.quantity,
        supplier_name: s.supplier_name,
        notes: s.notes,
      })
    }

    const plan = planItineraryTasks({
      itinerary,
      services,
      days,
      departments: departmentsRes.data ?? [],
      today,
    })

    if (plan.tasks.length === 0 && plan.skipped.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nothing on this itinerary needs a task yet — add its services or day details first.' },
        { status: 400 }
      )
    }

    const existing = existingRes.data ?? []
    const generated = existing.filter(t => t.service_type) as unknown as ExistingGeneratedTask[]
    // Tasks made by hand, or by the old AI generator — left exactly as they are.
    const otherTasks = existing.length - generated.length
    const sync = planSync(plan, generated)

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        tasks: sync.actions.map(a => ({
          action: a.kind,
          // Rows a regenerate adds unticked — what "Update" / "Reopen" means here.
          new_rows: a.kind === 'unchanged' ? 0 : a.checklist.filter(r => r.is_new && !r.booked).length,
          to_cancel: a.kind === 'unchanged' ? 0 : a.checklist.filter(r => r.removed).length,
          unpriced_rows: a.task.unpriced_count,
          service_type: a.task.service_type,
          label: a.task.label,
          service_count: a.task.service_count,
          department: a.task.department,
          due_date: a.task.due_date,
          priority: a.task.priority,
        })),
        skipped: plan.skipped,
        orphaned: sync.orphaned,
        other_tasks: otherTasks,
      })
    }

    // An assignee must be an active member of this company: notifications are
    // written with the admin client, so the check cannot be left to RLS.
    const wanted = [...new Set(Object.values(requested))]
    const valid = new Set<string>()
    if (wanted.length > 0) {
      const { data: members, error } = await supabase
        .from('team_members')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('is_active', true)
        .in('id', wanted)
      if (error) throw error
      for (const m of members ?? []) valid.add(m.id)
    }
    const assigneeFor = (deptId: string, current: string | null = null) =>
      current || (valid.has(requested[deptId]) ? requested[deptId] : null)

    const now = new Date().toISOString()

    // Creates — one insert.
    const creates = sync.actions.filter((a): a is Extract<TaskAction, { kind: 'create' }> => a.kind === 'create')
    let created: Array<{ id: string; assigned_to: string | null }> = []
    if (creates.length > 0) {
      const { data, error } = await supabase
        .from('tasks')
        .insert(creates.map(({ task, checklist }) => ({
          tenant_id,
          title: task.title,
          description: task.description,
          due_date: task.due_date,
          priority: task.priority,
          status: 'todo',
          checklist: checklist as unknown as Json,
          assigned_to: assigneeFor(task.department.id),
          department_id: task.department.id,
          linked_type: 'itinerary',
          linked_id: itineraryId,
          service_type: task.service_type,
          generation_snapshot: task.snapshot as unknown as Json,
          notes: `Auto-generated from ${itinerary.itinerary_code}`,
          archived: false,
        })))
        .select('id, assigned_to')
      if (error) throw error
      created = data ?? []
    }

    // Updates and reopens — one row each. The rows carry their ticks over
    // (mergeChecklist) and the status follows them. What a person set on the
    // task — priority, department, assignee — is theirs and stays; the due
    // date moves only when the trip itself changed.
    const currentById = new Map(generated.map(t => [t.id, t]))
    const reopened: Array<{ id: string; assigned_to: string | null }> = []
    let updatedCount = 0
    for (const action of sync.actions) {
      if (action.kind !== 'update' && action.kind !== 'reopen') continue
      const { task } = action
      const current = currentById.get(action.id)!
      const assignedTo = assigneeFor(task.department.id, current.assigned_to)
      const fields: Record<string, unknown> = {
        title: task.title,
        description: task.description,
        checklist: action.checklist,
        generation_snapshot: task.snapshot,
        assigned_to: assignedTo,
        status: action.status,
        updated_at: now,
      }
      if (action.tripChanged) fields.due_date = task.due_date
      if (action.status === 'done' && current.status !== 'done') fields.completed_at = now
      if (action.status !== 'done') fields.completed_at = null
      if (action.kind === 'reopen') Object.assign(fields, { archived: false, archived_at: null })

      const { error } = await supabase.from('tasks').update(fields).eq('id', action.id)
      if (error) throw error
      if (action.kind === 'reopen') reopened.push({ id: action.id, assigned_to: assignedTo })
      else updatedCount++
    }

    // Tell each person what landed on their list: new tasks and reopened ones.
    // Every assignee here is this company's — validated above, or already on
    // one of its tasks (read through RLS).
    const byAssignee = new Map<string, { created: string[]; reopened: string[] }>()
    const tally = (list: Array<{ id: string; assigned_to: string | null }>, key: 'created' | 'reopened') => {
      for (const t of list) {
        if (!t.assigned_to) continue
        if (!byAssignee.has(t.assigned_to)) byAssignee.set(t.assigned_to, { created: [], reopened: [] })
        byAssignee.get(t.assigned_to)![key].push(t.id)
      }
    }
    tally(created, 'created')
    tally(reopened, 'reopened')
    let notified = 0
    for (const [assigneeId, mine] of byAssignee) {
      const parts = [
        mine.created.length ? `${mine.created.length} new` : '',
        mine.reopened.length ? `${mine.reopened.length} reopened (itinerary changed)` : '',
      ].filter(Boolean).join(', ')
      try {
        await createNotification({
          team_member_id: assigneeId,
          type: 'task_assigned',
          title: `Operations tasks for ${itinerary.itinerary_code}: ${parts}`,
          message: `Operations tasks for itinerary ${itinerary.itinerary_code} (${itinerary.client_name ?? ''}, ${itinerary.start_date ?? '?'} to ${itinerary.end_date ?? '?'}): ${parts}. Please review and begin processing.`,
          link: '/tasks',
          related_task_id: mine.created[0] ?? mine.reopened[0] ?? null,
        })
        notified++
      } catch (err) {
        // The tasks are written; a failed notification must not undo that.
        console.error('Failed to notify task assignee:', err)
      }
    }

    const counts = {
      created: created.length,
      updated: updatedCount,
      reopened: reopened.length,
      unchanged: sync.actions.filter(a => a.kind === 'unchanged').length,
    }

    return NextResponse.json({
      success: true,
      count: counts.created + counts.updated + counts.reopened,
      counts,
      message: `Tasks: ${counts.created} created, ${counts.updated} updated, ${counts.reopened} reopened, ${counts.unchanged} unchanged`,
      skipped: plan.skipped,
      orphaned: sync.orphaned,
      notified,
    })
  } catch (error) {
    console.error('Error generating tasks:', error)
    return NextResponse.json({ success: false, error: 'Failed to generate tasks' }, { status: 500 })
  }
}
