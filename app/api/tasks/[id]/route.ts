import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { completeChecklist, type ChecklistItem } from '@/lib/tasks/itinerary-tasks'

// GET - Fetch single task
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
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        assigned_member:team_members(id, name, role, email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching task:', error)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in task GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update task (with archive support)
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

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    }

    // Standard fields
    if (body.title !== undefined) updateData.title = body.title
    if (body.description !== undefined) updateData.description = body.description
    if (body.due_date !== undefined) updateData.due_date = body.due_date
    if (body.priority !== undefined) updateData.priority = body.priority
    if (body.assigned_to !== undefined) updateData.assigned_to = body.assigned_to
    if (body.linked_type !== undefined) updateData.linked_type = body.linked_type
    if (body.linked_id !== undefined) updateData.linked_id = body.linked_id
    if (body.notes !== undefined) updateData.notes = body.notes

    // Status change with completed_at tracking
    if (body.status !== undefined) {
      updateData.status = body.status
      // A generated task's status follows its checklist, so completing it
      // ticks every row — otherwise it reads "Done, 0 of 2 booked" and the
      // next tick or regenerate moves it back to To Do.
      if (body.status === 'done') {
        const { data: current, error: readError } = await supabase
          .from('tasks')
          .select('checklist')
          .eq('id', id)
          .maybeSingle()
        if (readError) throw readError
        if (Array.isArray(current?.checklist)) {
          const done = completeChecklist(current.checklist as unknown as ChecklistItem[], updateData.updated_at as string)
          if (!done.ok) {
            return NextResponse.json(
              {
                error: `${done.toCancel} booking${done.toCancel === 1 ? '' : 's'} left the itinerary and must be cancelled first — open the task and mark ${done.toCancel === 1 ? 'it' : 'them'} Cancelled.`,
                to_cancel: done.toCancel,
              },
              { status: 409 }
            )
          }
          updateData.checklist = done.items
        }
      }
      if (body.status === 'done') {
        updateData.completed_at = new Date().toISOString()
      } else {
        updateData.completed_at = null
      }
    }

    // Archive/unarchive support
    if (body.archived !== undefined) {
      updateData.archived = body.archived
      updateData.archived_at = body.archived ? new Date().toISOString() : null
    }

    // Block tenant_id updates
    delete updateData.tenant_id

    const { data, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        assigned_member:team_members(id, name, role, email)
      `)
      .single()

    if (error) {
      console.error('Error updating task:', error)
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in task PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete task
export async function DELETE(
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
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting task:', error)
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in task DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}