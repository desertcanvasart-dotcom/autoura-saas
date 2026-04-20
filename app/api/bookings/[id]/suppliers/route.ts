import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET - List suppliers for a booking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { id } = await params

    const { data, error } = await supabase
      .from('booking_supplier_status')
      .select('*')
      .eq('booking_id', id)
      .order('service_date', { ascending: true })

    if (error) {
      console.error('Error fetching suppliers:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error('Suppliers GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Add supplier or update existing
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    // Update existing supplier
    if (body.id) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.status !== undefined) updates.status = body.status
      if (body.confirmation_number !== undefined) updates.confirmation_number = body.confirmation_number
      if (body.confirmation_notes !== undefined) updates.confirmation_notes = body.confirmation_notes
      if (body.confirmed_cost !== undefined) updates.confirmed_cost = body.confirmed_cost
      if (body.status === 'confirmed' && !body.confirmed_at) {
        updates.confirmed_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('booking_supplier_status')
        .update(updates)
        .eq('id', body.id)
        .eq('booking_id', id)
        .select()
        .single()

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

      // Check if all suppliers confirmed → update booking status
      await checkAndUpdateBookingStatus(supabase, id)

      return NextResponse.json({ success: true, data })
    }

    // Create new supplier entry
    if (!body.supplier_type || !body.supplier_name) {
      return NextResponse.json({ success: false, error: 'supplier_type and supplier_name are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('booking_supplier_status')
      .insert({
        tenant_id,
        booking_id: id,
        supplier_id: body.supplier_id || null,
        supplier_type: body.supplier_type,
        supplier_name: body.supplier_name,
        service_description: body.service_description || null,
        service_date: body.service_date || null,
        contact_name: body.contact_name || null,
        contact_email: body.contact_email || null,
        contact_phone: body.contact_phone || null,
        quoted_cost: body.quoted_cost || null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error) {
    console.error('Suppliers POST error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

async function checkAndUpdateBookingStatus(supabase: any, bookingId: string) {
  const { data: suppliers } = await supabase
    .from('booking_supplier_status')
    .select('status')
    .eq('booking_id', bookingId)

  if (!suppliers || suppliers.length === 0) return

  const allConfirmed = suppliers.every((s: any) => s.status === 'confirmed')
  if (allConfirmed) {
    const { data: booking } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .single()

    if (booking && booking.status === 'pending') {
      await supabase
        .from('bookings')
        .update({ status: 'supplier_confirmed', updated_at: new Date().toISOString() })
        .eq('id', bookingId)
    }
  }
}
