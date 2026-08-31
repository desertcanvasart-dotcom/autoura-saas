import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { createNotification } from '@/lib/notifications'

// POST /api/whatsapp/conversations/assign - Assign or claim a conversation
export async function POST(request: NextRequest) {
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
    const { conversation_id, agent_id, team_member_id, action } = body

    // Support both agent_id and team_member_id for backwards compatibility
    const assigneeId = team_member_id || agent_id

    if (!conversation_id) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    // Get current conversation state
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversation_id)
      .single()

    if (convError || !conversation) {
      console.error('Conversation not found:', convError)
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // whatsapp_conversations has no assignment columns in the live schema,
    // so there is no previous assignee to read.
    const oldAssigneeId = null

    // Handle different actions
    let newAssigneeId: string | null = null
    let actionType = 'assigned'

    if (action === 'claim') {
      if (!assigneeId) {
        return NextResponse.json({ error: 'Team member ID required for claim' }, { status: 400 })
      }
      newAssigneeId = assigneeId
      actionType = 'claimed'
    } else if (action === 'unassign') {
      newAssigneeId = null
      actionType = 'unassigned'
    } else if (action === 'transfer') {
      if (!assigneeId) {
        return NextResponse.json({ error: 'Team member ID required for transfer' }, { status: 400 })
      }
      newAssigneeId = assigneeId
      actionType = 'transferred'
    } else {
      newAssigneeId = assigneeId || null
      actionType = assigneeId ? 'assigned' : 'unassigned'
    }

    // Update conversation - use new assigned_team_member_id column primarily
    const updateData: Record<string, any> = {
      assigned_team_member_id: newAssigneeId,
      // assigned_agent_id used to be written here too -- a second column
      // holding the same id, with nothing reading it. One owner per fact.
      assigned_at: newAssigneeId ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }



    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversation_id)

    if (updateError) {
      console.error('Update error:', updateError)
      throw updateError
    }

    // ============================================
    // SEND NOTIFICATION TO ASSIGNED TEAM MEMBER
    // ============================================
    if (newAssigneeId && actionType !== 'claimed') {
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('id, name, email')
        .eq('id', newAssigneeId)
        .eq('is_active', true)
        .single()

      if (teamMember) {
        const clientName = conversation.client_name || conversation.phone_number

        // teamMember was fetched via the tenant-scoped (RLS) client above, so it
        // is guaranteed to belong to the caller's tenant.
        try {
          await createNotification({
            team_member_id: teamMember.id,
            type: 'whatsapp_assigned',
            title: 'New WhatsApp Chat Assigned',
            message: `You've been assigned a WhatsApp conversation with ${clientName}.`,
            link: `/whatsapp-inbox?conversation=${conversation_id}`,
            send_email: Boolean(teamMember.email),
          })
        } catch (notifError) {
          console.error('Notification create error:', notifError)
        }
      } else {

      }
    }

    // Log activity
    try {
      await supabase
        .from('conversation_activity')
        .insert({
          conversation_id,
          agent_id: newAssigneeId,
          team_member_id: newAssigneeId,
          action_type: actionType,
          action_details: {
            assigned_by: user.id,
            previous_assignee_id: oldAssigneeId,
            action: action || 'assign'
          }
        })
    } catch (activityError) {

    }

    // Fetch updated conversation
    const { data: updatedConversation } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversation_id)
      .single()

    // Get assignee details
    let assigneeDetails = null
    if (newAssigneeId) {
      const { data: tm } = await supabase
        .from('team_members')
        .select('id, name, email, avatar_url, role, is_available')
        .eq('id', newAssigneeId)
        .single()
      assigneeDetails = tm
    }

    return NextResponse.json({ 
      success: true, 
      conversation: {
        ...updatedConversation,
        assigned_agent: assigneeDetails
      },
      action: actionType,
      message: `Conversation ${actionType} successfully`
    })
  } catch (error: any) {
    console.error('Error assigning conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET /api/whatsapp/conversations/assign - Get assignment info
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
    const conversationId = searchParams.get('conversation_id')

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (error) throw error

    // whatsapp_conversations has no assignment columns in the live schema,
    // so there is no persisted assignee to report.
    const assigneeId: string | null = null

    let assignee = null
    if (assigneeId) {
      const { data: tm } = await supabase
        .from('team_members')
        .select('id, name, email, avatar_url, role, is_available')
        .eq('id', assigneeId)
        .single()
      assignee = tm
    }

    let history: any[] = []
    try {
      const { data: historyData } = await supabase
        .from('conversation_activity')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('action_type', ['assigned', 'claimed', 'transferred', 'unassigned', 'auto_assigned'])
        .order('created_at', { ascending: false })
        .limit(10)

      history = historyData || []
    } catch {
      // Activity table might not exist
    }

    return NextResponse.json({ 
      success: true,
      assignment: {
        current_agent: assignee,
        assigned_at: null,
        conversation_id: conversationId
      },
      history
    })
  } catch (error: any) {
    console.error('Error fetching assignment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}