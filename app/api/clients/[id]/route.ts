import { NextRequest, NextResponse } from 'next/server'
import { evaluateDeleteGuard } from '@/lib/delete-guard'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'
import { parseClientWrite, clientFullName } from '@/lib/clients/client-fields'

// GET single client
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id } = authResult

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .maybeSingle()

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

/**
 * Update a client: the fields the client forms edit, checked
 * (lib/clients/client-fields) — the body was written as sent, so the booking
 * counters the database keeps, or any other column, could be overwritten.
 * Staff and above; viewers read only. A rename updates full_name, which the
 * list, the search and every document show.
 */
async function updateClient(request: NextRequest, id: string) {
  const authResult = await requireAuth()
  if (authResult.error !== null) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
  }
  const denied = roleDenied(authResult.role, 'staff')
  if (denied) return denied
  const { supabase, tenant_id } = authResult

  const parsed = parseClientWrite(await request.json(), 'update')
  if ('error' in parsed) {
    return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
  }
  const updateData = { ...parsed.data, updated_at: new Date().toISOString() }

  if (updateData.first_name !== undefined || updateData.last_name !== undefined) {
    const { data: current } = await supabase
      .from('clients').select('first_name, last_name').eq('id', id).eq('tenant_id', tenant_id).maybeSingle()
    if (!current) return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })
    updateData.full_name = clientFullName(
      updateData.first_name !== undefined ? updateData.first_name : current.first_name,
      updateData.last_name !== undefined ? updateData.last_name : current.last_name,
    )
  }

  const { data, error } = await supabase
    .from('clients')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', tenant_id)
    .select()
    .maybeSingle()

  if (error) {
    console.error('Error updating client:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 })

  return NextResponse.json({ success: true, data })
}

// PUT - Update client
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    return await updateClient(request, id)
  } catch (error) {
    console.error('Error in PUT /api/clients/[id]:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Partial update client (the same: only the fields sent change)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    return await updateClient(request, id)
  } catch (error) {
    console.error('Error in PATCH /api/clients/[id]:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete client
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Managers and admins only — what the database's delete policy allows. A
    // member's delete removed nothing and was reported as done.
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult

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
    const { data: removed, error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select('id')

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

    if (!removed || removed.length === 0) {
      return NextResponse.json({ error: 'Client not found, or your role cannot delete it. Nothing was deleted.' }, { status: 404 })
    }

    return NextResponse.json({ success: true, message: 'Client deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/clients/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}