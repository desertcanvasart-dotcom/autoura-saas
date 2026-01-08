import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// POST /api/whatsapp/conversations/assign - Assign or claim a conversation
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { conversation_id, agent_id, action } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    // Get current user for audit
    const { data: { user } } = await supabase.auth.getUser()

    // Get current conversation state
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*, assigned_agent:sales_agents(*)')
      .eq('id', conversation_id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const oldAgentId = conversation.assigned_agent_id

    // Handle different actions
    let newAgentId: string | null = null
    let actionType = 'assigned'

    if (action === 'claim') {
      // Agent claiming for themselves
      if (!agent_id) {
        return NextResponse.json({ error: 'Agent ID required for claim' }, { status: 400 })
      }
      newAgentId = agent_id
      actionType = 'claimed'
    } else if (action === 'unassign') {
      // Remove assignment
      newAgentId = null
      actionType = 'unassigned'
    } else if (action === 'transfer') {
      // Transfer to another agent
      if (!agent_id) {
        return NextResponse.json({ error: 'Agent ID required for transfer' }, { status: 400 })
      }
      newAgentId = agent_id
      actionType = 'transferred'
    } else if (action === 'auto') {
      // Auto-assign using round-robin
      const { data: nextAgent } = await supabase
        .from('sales_agents')
        .select('id')
        .eq('is_active', true)
        .eq('is_available', true)
        .order('last_assigned_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (!nextAgent) {
        return NextResponse.json({ error: 'No available agents for auto-assign' }, { status: 400 })
      }
      newAgentId = nextAgent.id
      actionType = 'auto_assigned'
    } else {
      // Direct assignment
      newAgentId = agent_id || null
      actionType = agent_id ? 'assigned' : 'unassigned'
    }

    // Update old agent's count
    if (oldAgentId && oldAgentId !== newAgentId) {
      await supabase
        .from('sales_agents')
        .update({ 
          current_conversations: supabase.rpc('greatest', { a: 0, b: supabase.raw('current_conversations - 1') })
        })
        .eq('id', oldAgentId)
      
      // Simpler approach - just decrement
      await supabase.rpc('decrement_agent_conversations', { agent_id: oldAgentId }).catch(() => {
        // Fallback if RPC doesn't exist
        supabase
          .from('sales_agents')
          .select('current_conversations')
          .eq('id', oldAgentId)
          .single()
          .then(({ data }: { data: any }) => {
          if (data) {
              supabase
                .from('sales_agents')
                .update({ current_conversations: Math.max(0, (data.current_conversations || 1) - 1) })
                .eq('id', oldAgentId)
            }
          })
      })
    }

    // Update conversation
    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update({
        assigned_agent_id: newAgentId,
        assigned_at: newAgentId ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversation_id)

    if (updateError) throw updateError

    // Update new agent's count and last_assigned_at
    if (newAgentId && newAgentId !== oldAgentId) {
      const { data: agentData } = await supabase
        .from('sales_agents')
        .select('current_conversations')
        .eq('id', newAgentId)
        .single()

      await supabase
        .from('sales_agents')
        .update({ 
          current_conversations: (agentData?.current_conversations || 0) + 1,
          last_assigned_at: new Date().toISOString()
        })
        .eq('id', newAgentId)
    }

    // Log activity
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

    // ============================================
    // SEND NOTIFICATION TO ASSIGNED AGENT
    // ============================================
    if (newAgentId && actionType !== 'claimed') {
      // Get the agent's details to find their team_member record
      const { data: agent } = await supabase
        .from('sales_agents')
        .select('id, name, email')
        .eq('id', newAgentId)
        .single()

      if (agent?.email) {
        // Find the team_member by email
        const { data: teamMember } = await supabase
          .from('team_members')
          .select('id, name, email')
          .eq('email', agent.email)
          .eq('is_active', true)
          .single()

        if (teamMember) {
          // Get client name for notification
          const clientName = conversation.client_name || conversation.phone_number

          // Create notification
          await supabase
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
        }
      }
    }

    // Fetch updated conversation with agent
    const { data: updatedConversation } = await supabase
      .from('whatsapp_conversations')
      .select('*, assigned_agent:sales_agents(*)')
      .eq('id', conversation_id)
      .single()

    return NextResponse.json({ 
      success: true, 
      conversation: updatedConversation,
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

    // Get conversation with agent
    const { data: conversation, error } = await supabase
      .from('whatsapp_conversations')
      .select(`
        id,
        assigned_agent_id,
        assigned_at,
        last_agent_id,
        last_agent_reply_at,
        assigned_agent:sales_agents(*),
        last_agent:sales_agents(*)
      `)
      .eq('id', conversationId)
      .single()

    if (error) throw error

    // Get assignment history
    const { data: history } = await supabase
      .from('conversation_activity')
      .select(`
        *,
        agent:sales_agents(id, name, avatar_url)
      `)
      .eq('conversation_id', conversationId)
      .in('action_type', ['assigned', 'claimed', 'transferred', 'unassigned', 'auto_assigned'])
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({ 
      success: true,
      assignment: {
        current_agent: conversation?.assigned_agent || null,
        assigned_at: conversation?.assigned_at,
        last_agent: conversation?.last_agent || null,
        last_reply_at: conversation?.last_agent_reply_at
      },
      history: history || []
    })
  } catch (error: any) {
    console.error('Error fetching assignment:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}