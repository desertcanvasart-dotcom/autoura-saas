// GET /api/unified/client/[clientId]
// All unified conversations for a client + a channel-aware summary.
// Adapted to our single-table unified_conversations model (the sibling splits
// whatsapp/email tables). RLS scopes to the tenant.
import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import type { UnifiedChannel } from '@/app/types/unified'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  try {
    const { clientId } = await params
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'Client ID required' }, { status: 400 })
    }

    const supabase = await createAuthenticatedClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
    }

    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle()
    if (cErr || !client) {
      return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    }

    const { data: conversations } = await supabase
      .from('unified_conversations')
      .select(`
        *,
        client:clients(id, full_name, email, phone),
        assigned_to:team_members(id, name, email)
      `)
      .eq('client_id', clientId)
      .order('last_message_at', { ascending: false })

    const convs = (conversations || []) as any[]

    const by_channel: Record<UnifiedChannel, number> = { whatsapp: 0, email: 0 }
    let total_unread = 0
    let last_activity_at: string | null = null
    for (const c of convs) {
      const ch: UnifiedChannel = c.last_message_channel === 'email' ? 'email' : 'whatsapp'
      by_channel[ch] += 1
      total_unread += Number(c.unread_messages) || 0
      if (c.last_message_at && (!last_activity_at || new Date(c.last_message_at) > new Date(last_activity_at))) {
        last_activity_at = c.last_message_at
      }
    }

    const cl = client as any
    const full_name = cl.full_name || [cl.first_name, cl.last_name].filter(Boolean).join(' ').trim() || null

    return NextResponse.json({
      success: true,
      client: { ...cl, full_name },
      conversations: convs,
      summary: {
        total_conversations: convs.length,
        total_unread,
        starred_count: convs.filter(c => c.is_starred).length,
        by_channel,
        last_activity_at,
      },
    })
  } catch (error: any) {
    console.error('Error fetching client conversations:', error?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
