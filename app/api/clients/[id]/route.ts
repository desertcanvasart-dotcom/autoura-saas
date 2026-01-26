import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET single client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in GET /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update client
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    const { id } = await params
    const body = await request.json()

    // Remove fields that shouldn't be manually set
    const { id: _, tenant_id: __, ...updateData } = body

    // RLS will ensure user can only update their tenant's clients
    const { data, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PUT /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Partial update client
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    const { id } = await params
    const body = await request.json()

    // Remove fields that shouldn't be manually set
    const { id: _, tenant_id: __, ...updateData } = body

    // RLS will ensure user can only update their tenant's clients
    const { data, error } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating client:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete client
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    // First, check if client has any related records
    // Check for itineraries
    const { data: itineraries, error: itinError } = await supabase
      .from('itineraries')
      .select('id')
      .eq('client_id', id)
      .limit(1)

    if (itinError) {
      console.error('Error checking itineraries:', itinError)
    }

    if (itineraries && itineraries.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete client with existing itineraries. Please delete or reassign itineraries first.' },
        { status: 400 }
      )
    }

    // Check for invoices
    const { data: invoices, error: invError } = await supabase
      .from('invoices')
      .select('id')
      .eq('client_id', id)
      .limit(1)

    if (invError) {
      console.error('Error checking invoices:', invError)
      // Don't block if table doesn't exist
    }

    if (invoices && invoices.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete client with existing invoices. Please delete or reassign invoices first.' },
        { status: 400 }
      )
    }

    // Check for follow_ups
    const { data: followUps, error: fuError } = await supabase
      .from('follow_ups')
      .select('id')
      .eq('client_id', id)
      .limit(1)

    if (fuError) {
      console.error('Error checking follow_ups:', fuError)
      // Don't block if table doesn't exist
    }

    // If there are follow-ups, delete them first (they're not critical)
    if (followUps && followUps.length > 0) {
      const { error: deleteFollowUpsError } = await supabase
        .from('follow_ups')
        .delete()
        .eq('client_id', id)

      if (deleteFollowUpsError) {
        console.error('Error deleting follow-ups:', deleteFollowUpsError)
      }
    }

    // Check for WhatsApp conversations
    const { data: conversations, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('client_id', id)
      .limit(1)

    if (convError) {
      console.error('Error checking conversations:', convError)
      // Don't block if table doesn't exist
    }

    // Delete WhatsApp conversations if any
    if (conversations && conversations.length > 0) {
      // First delete messages
      const { error: deleteMessagesError } = await supabase
        .from('whatsapp_messages')
        .delete()
        .in('conversation_id', conversations.map(c => c.id))

      if (deleteMessagesError) {
        console.error('Error deleting messages:', deleteMessagesError)
      }

      // Then delete conversations
      const { error: deleteConvError } = await supabase
        .from('whatsapp_conversations')
        .delete()
        .eq('client_id', id)

      if (deleteConvError) {
        console.error('Error deleting conversations:', deleteConvError)
      }
    }

    // Now delete the client
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting client:', error)
      
      // Check if it's a foreign key constraint error
      if (error.code === '23503') {
        return NextResponse.json(
          { error: 'Cannot delete client due to related records. Please remove all related data first.' },
          { status: 400 }
        )
      }
      
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Client deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}