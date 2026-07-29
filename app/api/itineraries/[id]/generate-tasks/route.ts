import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { createNotification } from '@/lib/notifications'
import { createMessageWithRetry, getUserFriendlyError } from '@/lib/ai/anthropic-client'
import {
  buildTaskGenerationPrompt,
  parseTaskGenerationResponse,
  findDepartmentForServiceType,
  type DayForTasks,
} from '@/lib/ai/task-generation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { id: itineraryId } = await params
    const body = await request.json()
    const assignments: Record<string, string> = body.assignments || {}

    // 1. Fetch itinerary (RLS filters by tenant)
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('id, itinerary_code, client_name, trip_name, start_date, end_date, total_days, num_adults, num_children, num_infants, status')
      .eq('id', itineraryId)
      .single()

    if (itinError || !itinerary) {
      return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })
    }

    // Task due dates are computed from the trip dates and pax counts; without
    // them the generated tasks would be built from "null" placeholders.
    const { client_name, start_date, end_date, total_days, num_adults, num_children, status } = itinerary
    if (client_name === null || start_date === null || end_date === null ||
        total_days === null || num_adults === null || num_children === null || status === null) {
      return NextResponse.json(
        { success: false, error: 'Itinerary is missing dates or traveler counts required for task generation' },
        { status: 400 }
      )
    }

    // 2. Fetch days
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select('id, day_number, date, city, title, overnight_city')
      .eq('itinerary_id', itineraryId)
      .order('day_number')

    if (daysError || !days?.length) {
      return NextResponse.json({ success: false, error: 'No itinerary days found' }, { status: 400 })
    }

    // 3. Fetch services
    const dayIds = days.map(d => d.id)
    const { data: services } = await supabase
      .from('itinerary_services')
      .select('day_id, service_type, service_name, quantity, total_cost, notes, supplier_name')
      .in('day_id', dayIds)

    if (!services?.length) {
      return NextResponse.json({ success: false, error: 'No services found. Generate pricing first.' }, { status: 400 })
    }

    // 4. Group services by day
    const daysWithServices: DayForTasks[] = days.map(day => ({
      day_number: day.day_number,
      date: day.date ?? '',
      city: day.city ?? '',
      title: day.title ?? '',
      overnight_city: day.overnight_city ?? undefined,
      services: (services || [])
        .filter(s => s.day_id === day.id)
        .map(s => ({
          service_type: s.service_type ?? '',
          service_name: s.service_name,
          quantity: s.quantity ?? 0,
          total_cost: s.total_cost ?? 0,
          notes: s.notes,
          supplier_name: s.supplier_name,
        })),
    }))

    // 5. Fetch departments
    const { data: departments } = await supabase
      .from('departments')
      .select('id, name, service_types')
      .eq('is_active', true)

    // 6. Call Claude AI
    const prompt = buildTaskGenerationPrompt({
      itinerary_code: itinerary.itinerary_code,
      client_name,
      start_date,
      end_date,
      total_days,
      num_adults,
      num_children,
      num_infants: itinerary.num_infants ?? undefined,
      status,
      trip_name: itinerary.trip_name ?? undefined,
    }, daysWithServices)
    const message = await createMessageWithRetry({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    // 7. Parse AI response
    let aiTasks
    try {
      aiTasks = parseTaskGenerationResponse(responseText)
    } catch (parseError) {
      console.error('Failed to parse AI task response:', parseError)
      return NextResponse.json({ success: false, error: 'AI failed to generate valid tasks. Try again.' }, { status: 500 })
    }

    if (aiTasks.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'No tasks generated.', data: [] })
    }

    // 8. Map tasks to records
    const departmentsForMatching = (departments ?? []).map(d => ({
      id: d.id,
      name: d.name,
      service_types: d.service_types ?? [],
    }))
    const taskRecords = aiTasks.map(task => {
      const dept = departmentsForMatching.length ? findDepartmentForServiceType(task.service_type, departmentsForMatching) : null
      const assignedTo = dept ? (assignments[dept.id] || null) : null

      return {
        tenant_id,
        title: task.title,
        description: task.description,
        due_date: task.suggested_due_date || null,
        priority: task.priority,
        status: 'todo',
        assigned_to: assignedTo,
        department_id: dept?.id || null,
        linked_type: 'itinerary',
        linked_id: itineraryId,
        notes: `Auto-generated from ${itinerary.itinerary_code}`,
        archived: false,
      }
    })

    // 9. Bulk insert
    const { data: createdTasks, error: insertError } = await supabase
      .from('tasks')
      .insert(taskRecords)
      .select('id, title, priority, assigned_to, department_id')

    if (insertError) {
      console.error('Failed to insert tasks:', insertError)
      return NextResponse.json({ success: false, error: 'Failed to create tasks' }, { status: 500 })
    }

    // 10. Notify assignees
    const uniqueAssignees = [...new Set((createdTasks || []).map(t => t.assigned_to).filter(Boolean))]
    for (const assigneeId of uniqueAssignees) {
      const assigneeTasks = (createdTasks || []).filter(t => t.assigned_to === assigneeId)
      // assigneeId comes from tasks just inserted via the tenant-scoped client,
      // so it belongs to the caller's tenant.
      try {
        await createNotification({
          team_member_id: assigneeId as string,
          type: 'task_assigned',
          title: `${assigneeTasks.length} new task${assigneeTasks.length !== 1 ? 's' : ''} for ${itinerary.itinerary_code}`,
          message: `Operations tasks generated for ${itinerary.client_name} (${itinerary.start_date} to ${itinerary.end_date}).`,
          link: '/tasks',
        })
      } catch {}
    }

    return NextResponse.json({
      success: true,
      count: createdTasks?.length || 0,
      message: `Generated ${createdTasks?.length || 0} operations tasks`,
      data: createdTasks,
    })
  } catch (error) {
    console.error('Error generating tasks:', error)
    const { message, status } = getUserFriendlyError(error)
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
