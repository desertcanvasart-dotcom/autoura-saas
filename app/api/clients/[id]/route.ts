import { NextRequest, NextResponse } from 'next/server'
import { evaluateDeleteGuard } from '@/lib/delete-guard'
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
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
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
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
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

    // ────────────────────────────────────────────────────────────────────
    // WHY THIS WAS REWRITTEN
    // The old handler manually deleted follow_ups, then whatsapp_messages and
    // whatsapp_conversations, THEN deleted the client. But
    // email_conversations.client_id has no ON DELETE action, so a client with
    // email history failed the final delete with 23503 AFTER their WhatsApp
    // thread was already gone — communication history destroyed, client still
    // present, reported to the user as a safe "cannot delete".
    //
    // It also OVER-deleted: whatsapp_conversations is ON DELETE SET NULL, i.e.
    // the schema wants the thread RETAINED and detached, not erased. The
    // handler hard-deleted it anyway.
    //
    // The database handles this correctly by itself:
    //   client_notes, client_preferences, client_followups, follow_ups,
    //   communication_history, email_client_links        → CASCADE (removed)
    //   whatsapp_conversations, communication_threads,
    //   bookings, invoices, payments, commissions         → SET NULL (retained)
    //   email_conversations                               → blocks (NO ACTION)
    //
    // So: block up front on the money/commitment relations that a successful
    // delete would silently ORPHAN (SET NULL), and on the one relation that
    // hard-blocks — then issue ONE delete and let the DB cascade the rest in a
    // single atomic statement.
    // ────────────────────────────────────────────────────────────────────

    const [itineraries, invoices, payments, commissions, bookings, emails] = await Promise.all([
      supabase.from('itineraries').select('id', { count: 'exact', head: true }).eq('client_id', id),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('client_id', id),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('client_id', id),
      supabase.from('commissions').select('id', { count: 'exact', head: true }).eq('client_id', id),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('client_id', id),
      supabase.from('email_conversations').select('id', { count: 'exact', head: true }).eq('client_id', id),
    ])

    const guard = evaluateDeleteGuard('client', [
      { label: `${itineraries.count} itinerary(ies)`, count: itineraries.count, error: itineraries.error },
      { label: `${invoices.count} invoice(s)`, count: invoices.count, error: invoices.error },
      { label: `${payments.count} payment(s)`, count: payments.count, error: payments.error },
      { label: `${commissions.count} commission(s)`, count: commissions.count, error: commissions.error },
      { label: `${bookings.count} booking(s)`, count: bookings.count, error: bookings.error },
      { label: `${emails.count} email conversation(s)`, count: emails.count, error: emails.error },
    ])
    if (!guard.ok) {
      if (guard.kind === 'error') console.error('Client delete pre-check failed:', guard.label)
      return NextResponse.json(
        { error: guard.message },
        { status: guard.kind === 'error' ? 500 : 409 }
      )
    }

    // ONE statement. The DB cascades notes/preferences/follow-ups/history and
    // detaches (SET NULL) the WhatsApp thread — which the schema wants retained,
    // not erased — atomically.
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting client:', error)
      if (error.code === '23503') {
        return NextResponse.json(
          { error: 'Cannot delete this client — a linked record was created while deleting. Nothing was deleted; please try again.' },
          { status: 409 }
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