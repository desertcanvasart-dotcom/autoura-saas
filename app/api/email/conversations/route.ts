import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET - List email conversations
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'
    const search = searchParams.get('search') || ''
    const includeHidden = searchParams.get('include_hidden') === 'true'
    const agentId = searchParams.get('agent_id')
    const unassignedOnly = searchParams.get('unassigned_only') === 'true'
    const clientId = searchParams.get('client_id')

    let query = supabase
      .from('email_conversations')
      .select(`*, client:clients(id, first_name, last_name, email)`)
      .eq('status', status)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (clientId) query = query.eq('client_id', clientId)
    if (!includeHidden) query = query.or('is_hidden.is.null,is_hidden.eq.false')
    if (agentId) query = query.eq('assigned_team_member_id', agentId)
    if (unassignedOnly) query = query.is('assigned_team_member_id', null)
    if (search) query = query.or(`client_email.ilike.%${search}%,client_name.ilike.%${search}%,subject.ilike.%${search}%`)

    const { data, error } = await query.limit(50)
    if (error) throw error

    const conversations = (data || []).map((conv: any) => ({
      ...conv,
      client: conv.client ? { ...conv.client, full_name: `${conv.client.first_name || ''} ${conv.client.last_name || ''}`.trim() } : null,
    }))

    return NextResponse.json({ conversations, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// POST - Create or update conversation
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const body = await request.json()
    const { thread_id, user_id, client_email, subject, last_message_snippet, last_message_at, gmail_history_id } = body
    if (!thread_id) return NextResponse.json({ error: 'Thread ID required', success: false }, { status: 400 })

    const { data: existing } = await supabase.from('email_conversations').select('*').eq('thread_id', thread_id).single()

    if (existing) {
      const updates: any = { updated_at: new Date().toISOString() }
      if (existing.is_hidden) { updates.is_hidden = false; updates.hidden_at = null }
      if (subject) updates.subject = subject
      if (last_message_snippet) updates.last_message_snippet = last_message_snippet
      if (last_message_at) updates.last_message_at = last_message_at
      if (gmail_history_id) updates.gmail_history_id = gmail_history_id
      updates.last_sync_at = new Date().toISOString()

      const { data, error } = await supabase.from('email_conversations').update(updates).eq('id', existing.id).select().single()
      if (error) throw error
      return NextResponse.json({ conversation: data, created: false, success: true })
    }

    const { data, error } = await supabase
      .from('email_conversations')
      .insert({ tenant_id, thread_id, user_id: user_id || authResult.user?.id, client_email, subject, last_message_snippet, last_message_at, gmail_history_id, is_hidden: false, status: 'active', last_sync_at: new Date().toISOString() })
      .select().single()
    if (error) throw error
    return NextResponse.json({ conversation: data, created: true, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// PATCH - Update conversation status/assignment
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const body = await request.json()
    const { conversation_id, action, ...updates } = body
    if (!conversation_id) return NextResponse.json({ error: 'Conversation ID required', success: false }, { status: 400 })

    let updateData: any = { updated_at: new Date().toISOString() }
    if (action === 'mark_read') updateData.unread_count = 0
    else if (action === 'archive') updateData.status = 'archived'
    else if (action === 'unarchive') updateData.status = 'active'
    else if (action === 'assign') { updateData.assigned_team_member_id = updates.assigned_team_member_id; updateData.assigned_at = new Date().toISOString() }
    else if (action === 'unassign') { updateData.assigned_team_member_id = null; updateData.assigned_at = null }
    else updateData = { ...updateData, ...updates }

    const { data, error } = await supabase.from('email_conversations').update(updateData).eq('id', conversation_id).select().single()
    if (error) throw error
    return NextResponse.json({ conversation: data, success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// DELETE - Soft delete (hide)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ error: authResult.error, success: false }, { status: authResult.status })
    const { supabase, user } = authResult
    if (!supabase) return NextResponse.json({ error: 'Auth failed', success: false }, { status: 401 })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required', success: false }, { status: 400 })

    const { data, error } = await supabase.from('email_conversations').update({ is_hidden: true, hidden_at: new Date().toISOString(), hidden_by: user?.id }).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json({ success: true, conversation: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}
