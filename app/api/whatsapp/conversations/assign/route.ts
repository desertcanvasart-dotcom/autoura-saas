import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// POST /api/whatsapp/conversations/assign - Assign or claim a conversation
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { conversation_id, agent_id, team_member_id, action } = body

    // Support both agent_id and team_member_id
    const assigneeId = team_member_id || agent_id

    if (!conversation_id) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    // Get current user for audit
    const { data: { user } } = await supabase.auth.getUser()

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

    const oldAgentId = conversation.assigned_agent_id || conversation.assigned_to

    // Handle different actions
    let newAgentId: string | null = null
    let actionType = 'assigned'

    if (action === 'claim') {
      // Agent claiming for themselves
      if (!assigneeId) {
        return NextResponse.json({ error: 'Agent/Team member ID required for claim' }, { status: 400 })
      }
      newAgentId = assigneeId
      actionType = 'claimed'
    } else if (action === 'unassign') {
      // Remove assignment
      newAgentId = null
      actionType = 'unassigned'
    } else if (action === 'transfer') {
      // Transfer to another agent
      if (!assigneeId) {
        return NextResponse.json({ error: 'Agent/Team member ID required for transfer' }, { status: 400 })
      }
      newAgentId = assigneeId
      actionType = 'transferred'
    } else {
      // Direct assignment
      newAgentId = assigneeId || null
      actionType = assigneeId ? 'assigned' : 'unassigned'
    }

    // Update conversation - support both column names
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // Try to determine which column exists
    // Support both assigned_agent_id and assigned_to columns
    if ('assigned_agent_id' in conversation) {
      updateData.assigned_agent_id = newAgentId
      updateData.assigned_at = newAgentId ? new Date().toISOString() : null
    }
    if ('assigned_to' in conversation || !('assigned_agent_id' in conversation)) {
      updateData.assigned_to = newAgentId
      updateData.assigned_at = newAgentId ? new Date().toISOString() : null
    }

    console.log('Updating conversation with:', updateData)

    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update(updateData)
      .eq('id', conversation_id)

    if (updateError) {
      console.error('Update error:', updateError)
      throw updateError
    }

    // ============================================
    // SEND NOTIFICATION TO ASSIGNED AGENT
    // ============================================
    if (newAgentId && actionType !== 'claimed') {
      // Try to find team member by ID directly first
      let teamMember = null
      
      // Try team_members table
      const { data: tm } = await supabase
        .from('team_members')
        .select('id, name, email')
        .eq('id', newAgentId)
        .eq('is_active', true)
        .single()
      
      teamMember = tm

      // If not found, try sales_agents and lookup by email
      if (!teamMember) {
        const { data: agent } = await supabase
          .from('sales_agents')
          .select('id, name, email')
          .eq('id', newAgentId)
          .single()

        if (agent?.email) {
          const { data: tmByEmail } = await supabase
            .from('team_members')
            .select('id, name, email')
            .eq('email', agent.email)
            .eq('is_active', true)
            .single()
          
          teamMember = tmByEmail
        }
      }

      if (teamMember) {
        // Get client name for notification
        const clientName = conversation.client_name || conversation.contact_name || conversation.phone_number

        // Create notification
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            team_member_id: teamMember.id,
            type: 'whatsapp_assigned',
            title: 'New WhatsApp Chat Assigned',
            message: `You've been assigned a WhatsApp conversation with ${clientName}`,
            link: `/whatsapp-inbox?conversation=${conversation_id}`,
            is_read: false,
            email_sent: false
          })

        if (notifError) {
          console.error('Notification insert error:', notifError)
        } else {
          console.log('Notification created for team member:', teamMember.id)
        }

        // Send email notification
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
          await fetch(`${baseUrl}/api/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              team_member_id: teamMember.id,
              type: 'whatsapp_assigned',
              title: 'New WhatsApp Chat Assigned',
              message: `You've been assigned a WhatsApp conversation with ${clientName}. Last message: "${conversation.last_message?.substring(0, 100) || 'No messages yet'}"`,
              link: `/whatsapp-inbox?conversation=${conversation_id}`,
              send_email: true
            })
          })
        } catch (emailError) {
          console.error('Failed to send assignment email:', emailError)
          // Don't fail the whole request if email fails
        }
      } else {
        console.log('No team member found for notification, agent_id:', newAgentId)
      }
    }

    // Log activity if table exists
    try {
      await supabase
        .from('conversation_activity')
        .insert({
          conversation_id,
          agent_id: newAgentId,
          action_type: actionType,
          action_details: {
            assigned_by: user?.id || null,
            previous_agent_id: oldAgentId,
            action: action || 'assign'
          }
        })
    } catch (activityError) {
      // Activity logging is optional
      console.log('Activity log skipped:', activityError)
    }

    // Fetch updated conversation
    const { data: updatedConversation } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversation_id)
      .single()

    // Try to get assignee details
    let assigneeDetails = null
    if (newAgentId) {
      // Try team_members first
      const { data: tm } = await supabase
        .from('team_members')
        .select('id, name, email, avatar_url')
        .eq('id', newAgentId)
        .single()
      
      if (tm) {
        assigneeDetails = tm
      } else {
        // Try sales_agents
        const { data: sa } = await supabase
          .from('sales_agents')
          .select('id, name, email, avatar_url')
          .eq('id', newAgentId)
          .single()
        assigneeDetails = sa
      }
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
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    // Get conversation
    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (error) throw error

    // Get assignee ID from either column
    const assigneeId = conversation?.assigned_agent_id || conversation?.assigned_to

    // Get assignee details
    let assignee = null
    if (assigneeId) {
      // Try team_members first
      const { data: tm } = await supabase
        .from('team_members')
        .select('id, name, email, avatar_url')
        .eq('id', assigneeId)
        .single()
      
      if (tm) {
        assignee = tm
      } else {
        // Try sales_agents
        const { data: sa } = await supabase
          .from('sales_agents')
          .select('id, name, email, avatar_url')
          .eq('id', assigneeId)
          .single()
        assignee = sa
      }
    }

    // Get assignment history if table exists
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
        assigned_at: conversation?.assigned_at,
        conversation_id: conversationId
      },import { NextRequest, NextResponse } from 'next/server'
      import { createClient } from '@/app/supabase'
      
      // POST /api/whatsapp/conversations/assign - Assign or claim a conversation
      export async function POST(request: NextRequest) {
        try {
          const supabase = createClient()
          const body = await request.json()
          const { conversation_id, agent_id, team_member_id, action } = body
      
          // Support both agent_id and team_member_id for backwards compatibility
          const assigneeId = team_member_id || agent_id
      
          if (!conversation_id) {
            return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
          }
      
          // Get current user for audit
          const { data: { user } } = await supabase.auth.getUser()
      
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
      
          const oldAssigneeId = conversation.assigned_team_member_id || conversation.assigned_agent_id
      
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
            assigned_agent_id: newAssigneeId, // Keep in sync for backwards compatibility
            assigned_at: newAssigneeId ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          }
      
          console.log('Updating conversation with:', updateData)
      
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
            // Get team member directly - no more email lookup needed!
            const { data: teamMember } = await supabase
              .from('team_members')
              .select('id, name, email')
              .eq('id', newAssigneeId)
              .eq('is_active', true)
              .single()
      
            if (teamMember) {
              const clientName = conversation.client_name || conversation.contact_name || conversation.phone_number
      
              // Create in-app notification
              const { error: notifError } = await supabase
                .from('notifications')
                .insert({
                  team_member_id: teamMember.id,
                  type: 'whatsapp_assigned',
                  title: 'New WhatsApp Chat Assigned',
                  message: `You've been assigned a WhatsApp conversation with ${clientName}`,
                  link: `/whatsapp-inbox?conversation=${conversation_id}`,
                  is_read: false,
                  email_sent: false
                })
      
              if (notifError) {
                console.error('Notification insert error:', notifError)
              } else {
                console.log('✅ Notification created for team member:', teamMember.id, teamMember.name)
              }
      
              // Send email notification (optional)
              if (teamMember.email) {
                try {
                  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://autoura.net'
                  await fetch(`${baseUrl}/api/notifications`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      team_member_id: teamMember.id,
                      type: 'whatsapp_assigned',
                      title: 'New WhatsApp Chat Assigned',
                      message: `You've been assigned a WhatsApp conversation with ${clientName}. Last message: "${conversation.last_message?.substring(0, 100) || 'No messages yet'}"`,
                      link: `/whatsapp-inbox?conversation=${conversation_id}`,
                      send_email: true
                    })
                  })
                } catch (emailError) {
                  console.error('Failed to send assignment email:', emailError)
                }
              }
            } else {
              console.log('⚠️ Team member not found for notification, id:', newAssigneeId)
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
                  assigned_by: user?.id || null,
                  previous_assignee_id: oldAssigneeId,
                  action: action || 'assign'
                }
              })
          } catch (activityError) {
            console.log('Activity log skipped:', activityError)
          }
      
          // Fetch updated conversation with team member details
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
              assigned_agent: assigneeDetails // Keep same response shape for UI compatibility
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
          const supabase = createClient()
          const { searchParams } = new URL(request.url)
          const conversationId = searchParams.get('conversation_id')
      
          if (!conversationId) {
            return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
          }
      
          // Get conversation
          const { data: conversation, error } = await supabase
            .from('whatsapp_conversations')
            .select('*')
            .eq('id', conversationId)
            .single()
      
          if (error) throw error
      
          // Get assignee ID - prefer new column
          const assigneeId = conversation?.assigned_team_member_id || conversation?.assigned_agent_id
      
          // Get assignee details from team_members
          let assignee = null
          if (assigneeId) {
            const { data: tm } = await supabase
              .from('team_members')
              .select('id, name, email, avatar_url, role, is_available')
              .eq('id', assigneeId)
              .single()
            assignee = tm
          }
      
          // Get assignment history
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
              assigned_at: conversation?.assigned_at,
              conversation_id: conversationId
            },
            history
          })
        } catch (error: any) {
          console.error('Error fetching assignment:', error)
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
      }
      history
    })
  } catch (error: any) {
    console.error('Error fetching assignment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}