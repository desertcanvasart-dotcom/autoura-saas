import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/supabase'

// GET /api/whatsapp/activity - Get activity history for a conversation
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')
    const agentId = searchParams.get('agent_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const actionTypes = searchParams.get('action_types')?.split(',')

    let query = supabase
      .from('conversation_activity')
      .select(`
        *,
        agent:sales_agents(id, name, email, avatar_url)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (conversationId) {
      query = query.eq('conversation_id', conversationId)
    }

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    if (actionTypes && actionTypes.length > 0) {
      query = query.in('action_type', actionTypes)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      activities: data || [],
      count: data?.length || 0
    })
  } catch (error: any) {
    console.error('Error fetching activity:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/whatsapp/activity - Log a new activity
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { conversation_id, agent_id, action_type, action_details } = body

    if (!conversation_id || !action_type) {
      return NextResponse.json({ 
        error: 'Conversation ID and action type are required' 
      }, { status: 400 })
    }

    const validActionTypes = [
      'assigned', 'claimed', 'transferred', 'unassigned', 'auto_assigned',
      'replied', 'note_added', 'status_changed', 'viewed', 'exported'
    ]

    if (!validActionTypes.includes(action_type)) {
      return NextResponse.json({ 
        error: `Invalid action type. Must be one of: ${validActionTypes.join(', ')}` 
      }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('conversation_activity')
      .insert({
        conversation_id,
        agent_id: agent_id || null,
        action_type,
        action_details: action_details || {}
      })
      .select(`
        *,
        agent:sales_agents(id, name, avatar_url)
      `)
      .single()

    if (error) throw error

    // If this is a reply, update the conversation's last_agent fields
    if (action_type === 'replied' && agent_id) {
      await supabase
        .from('whatsapp_conversations')
        .update({
          last_agent_id: agent_id,
          last_agent_reply_at: new Date().toISOString()
        })
        .eq('id', conversation_id)
    }

    return NextResponse.json({ 
      success: true, 
      activity: data,
      message: 'Activity logged successfully'
    })
  } catch (error: any) {
    console.error('Error logging activity:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}