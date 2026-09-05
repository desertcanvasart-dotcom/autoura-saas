import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET /api/whatsapp/conversations - List all conversations

// The assigned agent is attached with a second read rather than a PostgREST
// embed. The embed also asked for team_members.avatar_url, which does not
// exist (photo_url does), so even with migration 309's foreign key in place
// the original query would still have failed. Reading separately also means
// this route works against a database that has not run 309 yet: the
// conversations load, they simply carry no assignee.
type WithAssignee = Record<string, unknown> & { assigned_team_member_id?: string | null }

// Structural, so this works with either Supabase client the route holds
// without dragging the full generated query-builder types through.
interface TeamMemberReader {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: string[]): PromiseLike<{ data: Array<{ id: string }> | null }>
    }
  }
}

async function attachAssignees<T extends WithAssignee>(
  db: unknown,
  rows: T[]
): Promise<Array<T & { assigned_agent: unknown }>> {
  const ids = [...new Set(rows.map((r) => r.assigned_team_member_id).filter(Boolean))] as string[]
  let byId: Record<string, unknown> = {}
  if (ids.length > 0) {
    const { data } = await (db as TeamMemberReader)
      .from('team_members')
      .select('id, name, email, avatar_url:photo_url, is_available')
      .in('id', ids)
    byId = Object.fromEntries((data ?? []).map((m) => [m.id, m]))
  }
  return rows.map((r) => ({
    ...r,
    assigned_agent: r.assigned_team_member_id ? byId[r.assigned_team_member_id] ?? null : null,
  }))
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'
    const search = searchParams.get('search') || ''
    const includeHidden = searchParams.get('include_hidden') === 'true'
    const agentId = searchParams.get('agent_id')
    const unassignedOnly = searchParams.get('unassigned_only') === 'true'

    let query = supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        clients (
          id,
          first_name,
          last_name,
          email,
          client_code
        )
      `)
      .eq('status', status)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    // Filter out hidden conversations unless explicitly requested
    if (!includeHidden) {
      query = query.or('is_hidden.is.null,is_hidden.eq.false')
    }

    // Filter by assigned agent (use team_member_id)
    if (agentId) {
      query = query.eq('assigned_team_member_id', agentId)
    }

    // Filter unassigned only
    if (unassignedOnly) {
      query = query.is('assigned_team_member_id', null)
    }

    if (search) {
      query = query.or(`phone_number.ilike.%${search}%,client_name.ilike.%${search}%`)
    }

    const { data, error } = await query.limit(50)

    if (error) throw error

    // Map to include full_name for convenience
    const conversations = (data || []).map((conv: any) => ({
      ...conv,
      clients: conv.clients ? {
        ...conv.clients,
        full_name: `${conv.clients.first_name || ''} ${conv.clients.last_name || ''}`.trim()
      } : null
    }))

    return NextResponse.json({ conversations: await attachAssignees(supabase, conversations) })
  } catch (error: any) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/whatsapp/conversations - Create or get conversation
export async function POST(request: NextRequest) {
  try {
    // Verify authentication and resolve tenant (tenant_id is required on insert)
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({
        error: authResult.error
      }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult

    const body = await request.json()
    const { phone_number, client_name, client_id, auto_assign } = body

    if (!phone_number) {
      return NextResponse.json({ error: 'Phone number required' }, { status: 400 })
    }

    // Clean phone number
    const cleanPhone = phone_number.replace(/[^\d+]/g, '')

    // Check if conversation exists (including hidden ones - we'll unhide it)
    const { data: existing } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('phone_number', cleanPhone)
      .single()

    if (existing) {
      const updates: any = {
        updated_at: new Date().toISOString()
      }

      if (client_name) updates.client_name = client_name
      if (client_id) updates.client_id = client_id

      if (Object.keys(updates).length > 1) {
        const { data: updated, error } = await supabase
          .from('whatsapp_conversations')
          .update(updates)
          .eq('id', existing.id)
          .select('*')
          .single()

        if (error) throw error
        const [withAgent] = await attachAssignees(supabase, [updated])
        return NextResponse.json({ conversation: withAgent, created: false })
      }
      const [existingWithAgent] = await attachAssignees(supabase, [existing])
      return NextResponse.json({ conversation: existingWithAgent, created: false })
    }

    // Create new conversation
    let assignedTeamMemberId = null

    // Auto-assign if requested. This used to order by last_assigned_at — a
    // column migration 309 deliberately never added ("selected but never
    // read by any UI") — so PostgREST rejected the query, the error was
    // discarded, and auto-assign silently never assigned anyone. The pick is
    // now the LEAST-LOADED available agent, counted from open conversations
    // at read time — the same recompute-from-source rule the agents route
    // follows (a stored counter/timestamp drifts).
    if (auto_assign !== false) {
      const { data: candidates } = await supabase
        .from('team_members')
        .select('id, created_at')
        .eq('is_active', true)
        .eq('is_available', true)
        .order('created_at', { ascending: true })

      if (candidates && candidates.length > 0) {
        const { data: open } = await supabase
          .from('whatsapp_conversations')
          .select('assigned_team_member_id')
          .eq('status', 'active')
          .not('assigned_team_member_id', 'is', null)
        const counts = new Map<string, number>()
        for (const row of (open ?? []) as Array<{ assigned_team_member_id: string }>) {
          counts.set(row.assigned_team_member_id, (counts.get(row.assigned_team_member_id) ?? 0) + 1)
        }
        // Fewest open conversations wins; ties go to the longest-serving
        // agent (the list is already ordered by created_at).
        let best = candidates[0]
        let bestCount = counts.get(best.id) ?? 0
        for (const c of candidates.slice(1)) {
          const n = counts.get(c.id) ?? 0
          if (n < bestCount) { best = c; bestCount = n }
        }
        assignedTeamMemberId = best.id
      }
    }

    // The assignment must land ON the conversation (mig 309 columns) — the
    // old code only wrote the activity log, so even a successful auto-assign
    // left the conversation unassigned.
    const { data: newConversation, error } = await supabase
      .from('whatsapp_conversations')
      .insert({
        tenant_id,
        phone_number: cleanPhone,
        client_name: client_name || null,
        client_id: client_id || null,
        ...(assignedTeamMemberId
          ? { assigned_team_member_id: assignedTeamMemberId, assigned_at: new Date().toISOString() }
          : {})
      })
      .select('*')
      .single()

    if (error) throw error

    if (assignedTeamMemberId) {
      // Log activity
      await supabase
        .from('conversation_activity')
        .insert({
          conversation_id: newConversation.id,
          agent_id: assignedTeamMemberId,
          team_member_id: assignedTeamMemberId,
          action_type: 'auto_assigned',
          action_details: { source: 'new_conversation' }
        })
    }

    const [createdWithAgent] = await attachAssignees(supabase, [newConversation])
    return NextResponse.json({ conversation: createdWithAgent, created: true })
  } catch (error: any) {
    console.error('Error creating conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/whatsapp/conversations - Update conversation (archive, mark read, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const body = await request.json()
    const { conversation_id, action, agent_id, ...updates } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }

    let updateData: any = { updated_at: new Date().toISOString() }

    if (action === 'mark_read') {
      updateData.unread_count = 0
    } else if (action === 'archive') {
      updateData.status = 'archived'
    } else if (action === 'unarchive') {
      updateData.status = 'active'
    } else if (action === 'unhide') {
      updateData.is_hidden = false
      updateData.hidden_at = null
      updateData.hidden_by = null
    } else {
      updateData = { ...updateData, ...updates }
    }

    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversation_id)
      .select('*')
      .single()

    if (error) throw error

    // Log activity if agent provided
    if (agent_id && action) {
      await supabase
        .from('conversation_activity')
        .insert({
          conversation_id,
          agent_id,
          team_member_id: agent_id,
          action_type: 'status_changed',
          action_details: { action, updates }
        })
    }

    const [updatedWithAgent] = await attachAssignees(supabase, [data])
    return NextResponse.json({ conversation: updatedWithAgent })
  } catch (error: any) {
    console.error('Error updating conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/whatsapp/conversations - Hide (soft delete) a conversation
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('id')

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }

    // Soft delete - just hide the conversation
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({
        is_hidden: true,
        hidden_at: new Date().toISOString(),
        hidden_by: user.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      message: 'Conversation hidden successfully',
      conversation: data
    })
  } catch (error: any) {
    console.error('Error hiding conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}