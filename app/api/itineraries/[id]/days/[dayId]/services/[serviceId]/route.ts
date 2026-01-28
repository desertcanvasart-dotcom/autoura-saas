// API Route: /api/itineraries/[id]/days/[dayId]/services/[serviceId]/route.ts
// Updated to handle transport-specific fields

import { requireAuth } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> }
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
    const { id, dayId, serviceId } = await params
    const body = await request.json()

    // Extract all fields including transport-specific ones
    const updateData: Record<string, any> = {
      service_name: body.service_name,
      service_code: body.service_code,
      service_type: body.service_type,
      quantity: body.quantity,
      rate_eur: body.rate_eur,
      rate_non_eur: body.rate_non_eur,
      total_cost: body.total_cost,
      notes: body.notes,
      supplier_id: body.supplier_id,
      supplier_name: body.supplier_name,
      commission_rate: body.commission_rate,
      commission_amount: body.commission_amount,
      commission_status: body.commission_status,
      client_price: body.client_price,
      is_preferred_supplier: body.is_preferred_supplier,
      // Transport-specific fields
      vehicle_type: body.vehicle_type || null,
      pickup_location: body.pickup_location || null,
      dropoff_location: body.dropoff_location || null,
      pickup_time: body.pickup_time || null,
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key]
      }
    })

    const { data, error } = await supabase
      .from('itinerary_services')
      .update(updateData)
      .eq('id', serviceId)
      .eq('day_id', dayId)
      .select()
      .single()

    if (error) {
      console.error('Error updating service:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> }
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
    const { id, dayId, serviceId } = await params

    // RLS ensures user can only delete their tenant's services
    const { error } = await supabase
      .from('itinerary_services')
      .delete()
      .eq('id', serviceId)
      .eq('day_id', dayId)

    if (error) {
      console.error('Error deleting service:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; dayId: string; serviceId: string }> }
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
    const { id, dayId, serviceId } = await params

    // RLS ensures user can only view their tenant's services
    const { data, error } = await supabase
      .from('itinerary_services')
      .select(`
        *,
        suppliers (
          id,
          name,
          type,
          contact_name,
          contact_phone,
          contact_email,
          city
        )
      `)
      .eq('id', serviceId)
      .eq('day_id', dayId)
      .single()

    if (error) {
      console.error('Error fetching service:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Server error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}