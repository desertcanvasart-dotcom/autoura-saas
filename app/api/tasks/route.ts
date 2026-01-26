import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
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

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    const assignedTo = searchParams.get('assignedTo')
    const dueDate = searchParams.get('dueDate')
    const includeArchived = searchParams.get('includeArchived') === 'true'

    // Build query
    let query = supabase
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members!tasks_assigned_to_fkey(id, name, role, email)
      `)
      .order('created_at', { ascending: false })

    // Filter by archived status - only show non-archived by default
    if (!includeArchived) {
      query = query.or('archived.eq.false,archived.is.null')
    }

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    // Due date filters
    if (dueDate) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]

      if (dueDate === 'overdue') {
        query = query.lt('due_date', todayStr).neq('status', 'done')
      } else if (dueDate === 'today') {
        query = query.eq('due_date', todayStr)
      } else if (dueDate === 'week') {
        const weekEnd = new Date(today)
        weekEnd.setDate(weekEnd.getDate() + 7)
        const weekEndStr = weekEnd.toISOString().split('T')[0]
        query = query.gte('due_date', todayStr).lte('due_date', weekEndStr)
      } else if (dueDate === 'upcoming') {
        query = query.gte('due_date', todayStr)
      }
    }

    const { data: tasks, error } = await query

    if (error) {
      console.error('Error fetching tasks:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Calculate summary from all tasks for accurate counts
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('id, status, priority, due_date, archived')

    const today = new Date().toISOString().split('T')[0]
    const nonArchivedTasks = (allTasks || []).filter(t => !t.archived)
    const archivedCount = (allTasks || []).filter(t => t.archived).length

    const summary = {
      total: nonArchivedTasks.length,
      todo: nonArchivedTasks.filter(t => t.status === 'todo').length,
      in_progress: nonArchivedTasks.filter(t => t.status === 'in_progress').length,
      done: nonArchivedTasks.filter(t => t.status === 'done').length,
      overdue: nonArchivedTasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done').length,
      due_today: nonArchivedTasks.filter(t => t.due_date === today).length,
      high_priority: nonArchivedTasks.filter(t => t.priority === 'high' || t.priority === 'urgent').length,
      archived: archivedCount
    }

    return NextResponse.json({ 
      success: true, 
      data: tasks || [],
      summary
    })
  } catch (error) {
    console.error('Error in tasks GET:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json()

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: body.title,
        description: body.description || null,
        due_date: body.due_date || null,
        priority: body.priority || 'medium',
        status: 'todo',
        assigned_to: body.assigned_to || null,
        linked_type: body.linked_type || null,
        linked_id: body.linked_id || null,
        notes: body.notes || null,
        archived: false,
        archived_at: null
      })
      .select(`
        *,
        assigned_member:team_members!tasks_assigned_to_fkey(id, name, role, email)
      `)
      .single()

    if (error) {
      console.error('Error creating task:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in tasks POST:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}