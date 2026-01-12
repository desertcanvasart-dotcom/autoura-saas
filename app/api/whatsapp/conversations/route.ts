import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// GET /api/whatsapp/conversations - List all conversations
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
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
        ),
        assigned_agent:team_members!whatsapp_conversations_assigned_team_member_id_fkey (
          id,
          name,
          email,
          avatar_url,
          is_available
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

    return NextResponse.json({ conversations })
  } catch (error: any) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/whatsapp/conversations - Create or get conversation
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
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
      // If it was hidden, unhide it
      const updates: any = {
        updated_at: new Date().toISOString()
      }
      
      if (existing.is_hidden) {
        updates.is_hidden = false
        updates.hidden_at = null
        updates.hidden_by = null
      }
      
      if (client_name) updates.client_name = client_name
      if (client_id) updates.client_id = client_id

      if (Object.keys(updates).length > 1) {
        const { data: updated, error } = await supabase
          .from('whatsapp_conversations')
          .update(updates)
          .eq('id', existing.id)
          .select(`
            *,
            assigned_agent:team_members!whatsapp_conversations_assigned_team_member_id_fkey (*)
          `)
          .single()

        if (error) throw error
        return NextResponse.json({ conversation: updated, created: false })
      }
      return NextResponse.json({ conversation: existing, created: false })
    }

    // Create new conversation
    let assignedTeamMemberId = null

    // Auto-assign if requested
    if (auto_assign !== false) {
      const { data: nextAgent } = await supabase
        .from('team_members')
        .select('id')
        .eq('is_active', true)
        .eq('is_available', true)
        .order('last_assigned_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (nextAgent) {
        assignedTeamMemberId = nextAgent.id
      }
    }

    const { data: newConversation, error } = await supabase
      .from('whatsapp_conversations')
      .insert({
        phone_number: cleanPhone,
        client_name: client_name || null,
        client_id: client_id || null,
        is_hidden: false,
        assigned_team_member_id: assignedTeamMemberId,
        assigned_agent_id: assignedTeamMemberId, // Keep in sync for backwards compatibility
        assigned_at: assignedTeamMemberId ? new Date().toISOString() : null
      })
      .select(`
        *,
        assigned_agent:team_members!whatsapp_conversations_assigned_team_member_id_fkey (*)
      `)
      .single()

    if (error) throw error

    // Update team member's count if assigned
    if (assignedTeamMemberId) {
      const { data: memberData } = await supabase
        .from('team_members')
        .select('current_conversations')
        .eq('id', assignedTeamMemberId)
        .single()

      await supabase
        .from('team_members')
        .update({ 
          current_conversations: (memberData?.current_conversations || 0) + 1,
          last_assigned_at: new Date().toISOString()
        })
        .eq('id', assignedTeamMemberId)

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

    return NextResponse.json({ conversation: newConversation, created: true })
  } catch (error: any) {
    console.error('Error creating conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/whatsapp/conversations - Update conversation (archive, mark read, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createClient()
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
      .select(`
        *,
        assigned_agent:team_members!whatsapp_conversations_assigned_team_member_id_fkey (*)
      `)
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

    return NextResponse.json({ conversation: data })
  } catch (error: any) {
    console.error('Error updating conversation:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/whatsapp/conversations - Hide (soft delete) a conversation
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('id')

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }

    // Get current user for audit trail
    const { data: { user } } = await supabase.auth.getUser()

    // Soft delete - just hide the conversation
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .update({
        is_hidden: true,
        hidden_at: new Date().toISOString(),
        hidden_by: user?.id || null,
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