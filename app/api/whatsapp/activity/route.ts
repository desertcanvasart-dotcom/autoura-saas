import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// Agents are team_members (there is no sales_agents table — embedding it
// killed every activity query with PGRST200). Attach the agent app-side in
// the shape the embed was supposed to produce; photo_url is aliased to
// avatar_url, the same mapping the agents route uses (mig 309 note).
async function attachAgents(
  supabase: NonNullable<Awaited<ReturnType<typeof requireAuth>>['supabase']>,
  rows: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const ids = [
    ...new Set(
      rows
        .map(r => (r.team_member_id as string | null) ?? (r.agent_id as string | null))
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const { data: members } = ids.length
    ? await supabase.from('team_members').select('id, name, email, photo_url').in('id', ids)
    : { data: [] }
  const byId = new Map(
    (members ?? []).map((m: { id: string; name: string | null; email: string | null; photo_url: string | null }) => [
      m.id,
      { id: m.id, name: m.name, email: m.email, avatar_url: m.photo_url },
    ])
  )
  return rows.map(r => ({
    ...r,
    agent: byId.get(((r.team_member_id as string | null) ?? (r.agent_id as string | null)) || '') ?? null,
  }))
}

// Verify a conversation belongs to the caller's tenant (RLS-scoped lookup).
async function assertConversationInTenant(
  supabase: NonNullable<Awaited<ReturnType<typeof requireAuth>>['supabase']>,
  conversationId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('id', conversationId)
    .maybeSingle()
  return Boolean(data)
}

// GET /api/whatsapp/activity - Get activity history for a conversation
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const supabase = auth.supabase!

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversation_id')
    const agentId = searchParams.get('agent_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const actionTypes = searchParams.get('action_types')?.split(',')

    // Activity is always scoped to a conversation the caller's tenant owns.
    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }
    if (!(await assertConversationInTenant(supabase, conversationId))) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // There is no sales_agents table — the old embed made PostgREST reject
    // the whole query (PGRST200), so the activity feed was always empty.
    // Agents are team_members; they are joined app-side below.
    let query = supabase
      .from('conversation_activity')
      .select('id, conversation_id, agent_id, team_member_id, action_type, action_details, created_at')
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

    const activities = await attachAgents(supabase, data || [])

    return NextResponse.json({
      success: true,
      activities,
      count: activities.length
    })
  } catch (error: any) {
    console.error('Error fetching activity:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/whatsapp/activity - Log a new activity
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (auth.error !== null) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const supabase = auth.supabase!

    const body = await request.json()
    const { conversation_id, agent_id, action_type, action_details } = body

    if (!conversation_id || !action_type) {
      return NextResponse.json({
        error: 'Conversation ID and action type are required'
      }, { status: 400 })
    }

    if (!(await assertConversationInTenant(supabase, conversation_id))) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
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
      .select('id, conversation_id, agent_id, team_member_id, action_type, action_details, created_at')
      .single()

    if (error) throw error

    // Agent replies are tracked via conversation_activity above;
    // whatsapp_conversations has no last_agent_id / last_agent_reply_at columns.

    const [activity] = await attachAgents(supabase, [data])

    return NextResponse.json({
      success: true,
      activity,
      message: 'Activity logged successfully'
    })
  } catch (error: any) {
    console.error('Error logging activity:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}