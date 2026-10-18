import { gateRole } from '@/lib/api-role-gate'
import { checkCommissionFields } from '@/lib/commissions/commission-fields'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { recordsInTenant } from '@/lib/quotes/records-in-tenant'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

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

    // RLS automatically filters by tenant_id
    const { data, error } = await supabase
      .from('commissions')
      .select(`
        *,
        supplier:suppliers(id, name, type, contact_email, contact_phone),
        itinerary:itineraries(id, itinerary_code, client_name, start_date, end_date, total_cost),
        client:clients(id, first_name, last_name, email)
      `)
      .eq('id', id)
      .single()

    if (error) {
      console.error('Error fetching commission:', error)
      return NextResponse.json({ error: 'Commission not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in commission GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

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

    // Allowlist of writable fields. Prior code passed `body` straight to
    // .update() — a caller could PUT { tenant_id: '<other>', id: '<other>',
    // amount: 9999 } and rewrite the row entirely. RLS gates the parent
    // tenant but the update still rewrites the row in place if the existing
    // tenant_id matches the session's.
    // Every field the edit form changes. Type, category, base, rate,
    // description, source and dates were missing, so an edit from Receivable
    // to Payable, or 10% to 15%, saved only the amount.
    const allowedFields = [
      'supplier_id',
      'itinerary_id',
      'client_id',
      'commission_type',
      'category',
      'base_amount',
      'commission_rate',
      'commission_amount',
      'currency',
      'status',
      'description',
      'source_name',
      'source_contact',
      'transaction_date',
      'due_date',
      'paid_date',
      'notes',
    ]
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] === undefined) continue
      const v = typeof body[field] === 'string' ? body[field].trim() : body[field]
      updateData[field] = v === '' ? null : v
    }
    const bad = checkCommissionFields(updateData)
    if (bad) return NextResponse.json({ success: false, error: bad }, { status: 400 })

    // The client and trip must be this tenant's: the foreign key does not
    // check the tenant (documents audit, round 12).
    const refs = await recordsInTenant(supabase, authResult.tenant_id, {
      client_id: updateData.client_id,
      itinerary_id: updateData.itinerary_id,
    })
    if (!refs.ok) return NextResponse.json({ success: false, error: refs.error }, { status: refs.status })

    // If marking as received/paid, set the paid_date if caller didn't.
    if ((updateData.status === 'received' || updateData.status === 'paid') && !updateData.paid_date) {
      updateData.paid_date = new Date().toISOString().split('T')[0]
    }

    // RLS ensures only tenant's commissions can be updated
    const { data, error } = await supabase
      .from('commissions')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        supplier:suppliers(id, name, type),
        itinerary:itineraries(id, itinerary_code, client_name)
      `)
      .single()

    if (error) {
      console.error('Error updating commission:', error)
      return NextResponse.json({ error: 'Failed to update commission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error in commission PUT:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Viewers read nothing here and change nothing; deletes and the
  // finance-only areas are for managers and admins (lib/api-role-gate).
  const roleGate = await gateRole('manage')
  if (roleGate) return roleGate

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

    // RLS ensures only tenant's commissions can be deleted
    const { data: removed, error } = await supabase
      .from('commissions')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) {
      console.error('Error deleting commission:', error)
      return NextResponse.json({ error: 'Failed to delete commission' }, { status: 500 })
    }
    if (!removed || removed.length === 0) {
      return NextResponse.json({ error: 'Commission not found, or your role cannot delete it. Nothing was deleted.' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in commission DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}