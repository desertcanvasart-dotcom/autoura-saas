import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

export async function GET(
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
    const allowedFields = [
      'supplier_id',
      'itinerary_id',
      'client_id',
      'commission_amount',
      'commission_percent',
      'currency',
      'status',
      'paid_date',
      'notes',
    ]
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field]
    }

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
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const { id } = await params

    // RLS ensures only tenant's commissions can be deleted
    const { error } = await supabase
      .from('commissions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting commission:', error)
      return NextResponse.json({ error: 'Failed to delete commission' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in commission DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}