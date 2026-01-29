import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// ============================================
// SINGLE TOUR DEPARTURE API
// File: app/api/departures/[id]/route.ts
//
// Get, update, and delete individual departures
// ============================================

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/departures/[id]
 * Get a single departure with bookings
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { id } = await params

    const { data, error } = await supabase
      .from('tour_departures')
      .select(`
        *,
        tour_template:tour_templates(id, template_name, template_code, duration_days, short_description),
        bookings:departure_bookings(
          id, client_id, booking_name, num_adults, num_children, status,
          total_price, deposit_paid, special_requests, booked_at
        )
      `)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'Departure not found' },
          { status: 404 }
        )
      }
      console.error('Error fetching departure:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: unknown) {
    console.error('Departure GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/departures/[id]
 * Update a departure
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await request.json()

    // Fields that can be updated
    const allowedFields = [
      'tour_name', 'tour_code', 'start_date', 'end_date', 'duration_days',
      'max_pax', 'min_pax', 'booked_pax', 'status', 'cutoff_days',
      'is_guaranteed', 'price_per_person', 'currency',
      'assigned_guide_id', 'assigned_vehicle_id',
      'public_notes', 'internal_notes'
    ]

    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Validate status if provided
    if (updateData.status) {
      const validStatuses = ['draft', 'open', 'limited', 'full', 'guaranteed', 'cancelled']
      if (!validStatuses.includes(updateData.status as string)) {
        return NextResponse.json(
          { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Recalculate end_date if start_date or duration_days changed
    if (updateData.start_date || updateData.duration_days) {
      // Fetch current departure to get existing values
      const { data: current } = await supabase
        .from('tour_departures')
        .select('start_date, duration_days')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single()

      if (current) {
        const startDate = (updateData.start_date as string) || current.start_date
        const durationDays = (updateData.duration_days as number) || current.duration_days

        const startDateObj = new Date(startDate)
        const endDateObj = new Date(startDateObj)
        endDateObj.setDate(endDateObj.getDate() + durationDays - 1)
        updateData.end_date = endDateObj.toISOString().split('T')[0]
      }
    }

    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('tour_departures')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .select(`
        *,
        tour_template:tour_templates(id, template_name, template_code, duration_days)
      `)
      .single()

    if (error) {
      console.error('Error updating departure:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Departure not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: unknown) {
    console.error('Departure PUT error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/departures/[id]
 * Delete a departure (and its bookings via CASCADE)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { id } = await params

    // Check if departure has bookings
    const { count } = await supabase
      .from('departure_bookings')
      .select('*', { count: 'exact', head: true })
      .eq('departure_id', id)
      .in('status', ['pending', 'confirmed'])

    if (count && count > 0) {
      return NextResponse.json(
        { success: false, error: `Cannot delete departure with ${count} active booking(s). Cancel bookings first.` },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('tour_departures')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenant_id)

    if (error) {
      console.error('Error deleting departure:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Departure deleted successfully'
    })
  } catch (error: unknown) {
    console.error('Departure DELETE error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
