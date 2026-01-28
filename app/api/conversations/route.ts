// app/api/conversations/route.ts
// Unified Conversations API - List and create conversations

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()
    const { searchParams } = new URL(request.url)

    // Query parameters
    const status = searchParams.get('status') || 'active'
    const search = searchParams.get('search')
    const assignedTo = searchParams.get('assigned_to')
    const channel = searchParams.get('channel') // 'whatsapp', 'email', 'all'
    const starred = searchParams.get('starred')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    // Build query
    let query = supabase
      .from('unified_conversations')
      .select(`
        *,
        client:clients(id, full_name, email, phone, nationality),
        assigned_to:team_members(id, name, email)
      `, { count: 'exact' })

    // Filter by status
    if (status !== 'all') {
      query = query.eq('status', status)
    }

    // Search by name, email, or phone
    if (search) {
      query = query.or(`contact_name.ilike.%${search}%,contact_email.ilike.%${search}%,contact_phone.ilike.%${search}%`)
    }

    // Filter by assignment
    if (assignedTo === 'me') {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Get team member ID for current user
        const { data: teamMember } = await supabase
          .from('team_members')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (teamMember) {
          query = query.eq('assigned_team_member_id', teamMember.id)
        }
      }
    } else if (assignedTo === 'unassigned') {
      query = query.is('assigned_team_member_id', null)
    } else if (assignedTo) {
      query = query.eq('assigned_team_member_id', assignedTo)
    }

    // Filter by channel
    if (channel === 'whatsapp') {
      query = query.not('whatsapp_conversation_id', 'is', null)
    } else if (channel === 'email') {
      query = query.is('whatsapp_conversation_id', null).not('contact_email', 'is', null)
    }

    // Filter by starred
    if (starred === 'true') {
      query = query.eq('is_starred', true)
    }

    // Order and paginate
    query = query
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching conversations:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    })
  } catch (error: any) {
    console.error('Conversations API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedClient()
    const body = await request.json()

    const { contact_name, contact_email, contact_phone, client_id } = body

    if (!contact_email && !contact_phone) {
      return NextResponse.json(
        { success: false, error: 'Either email or phone is required' },
        { status: 400 }
      )
    }

    // Get tenant_id
    const { data: tenantData } = await supabase.rpc('get_user_tenant_id')
    const tenantId = tenantData

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant not found' },
        { status: 400 }
      )
    }

    // Use the database function to find or create
    const { data: conversationId, error: funcError } = await supabase.rpc(
      'find_or_create_unified_conversation',
      {
        p_tenant_id: tenantId,
        p_email: contact_email || null,
        p_phone: contact_phone || null,
        p_name: contact_name || null
      }
    )

    if (funcError) {
      console.error('Error creating conversation:', funcError)
      throw funcError
    }

    // Update with client_id if provided
    if (client_id) {
      await supabase
        .from('unified_conversations')
        .update({ client_id, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
    }

    // Fetch the created/found conversation
    const { data: conversation, error: fetchError } = await supabase
      .from('unified_conversations')
      .select(`
        *,
        client:clients(id, full_name, email, phone),
        assigned_to:team_members(id, name, email)
      `)
      .eq('id', conversationId)
      .single()

    if (fetchError) throw fetchError

    return NextResponse.json({
      success: true,
      data: conversation
    })
  } catch (error: any) {
    console.error('Create conversation error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
