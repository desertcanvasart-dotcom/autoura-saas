import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

// GET passengers for a booking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id } = authResult
    const adminClient = createAdminClient()

    const { data: passengers, error } = await adminClient
      .from('booking_passengers')
      .select('*')
      .eq('booking_id', id)
      .eq('tenant_id', tenant_id)
      .order('is_lead_passenger', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching passengers:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch passengers' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: passengers || []
    })
  } catch (error: any) {
    console.error('Error in passengers GET:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST create passenger
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id } = authResult
    const adminClient = createAdminClient()
    const body = await request.json()

    // Verify booking exists and belongs to tenant
    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      )
    }

    const {
      title,
      first_name,
      last_name,
      date_of_birth,
      gender,
      nationality,
      email,
      phone,
      emergency_contact_name,
      emergency_contact_phone,
      passport_number,
      passport_expiry,
      passport_issuing_country,
      visa_required,
      passenger_type = 'adult',
      is_lead_passenger = false,
      room_type,
      meal_preference,
      mobility_requirements,
      medical_conditions,
      special_requests
    } = body

    if (!first_name || !last_name) {
      return NextResponse.json(
        { success: false, error: 'First name and last name are required' },
        { status: 400 }
      )
    }

    const passengerData = {
      tenant_id,
      booking_id: id,
      title,
      first_name,
      last_name,
      date_of_birth,
      gender,
      nationality,
      email,
      phone,
      emergency_contact_name,
      emergency_contact_phone,
      passport_number,
      passport_expiry,
      passport_issuing_country,
      visa_required,
      passenger_type,
      is_lead_passenger,
      room_type,
      meal_preference,
      mobility_requirements,
      medical_conditions,
      special_requests
    }

    const { data: passenger, error } = await adminClient
      .from('booking_passengers')
      .insert(passengerData)
      .select()
      .single()

    if (error) {
      console.error('Error creating passenger:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create passenger', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Passenger added successfully',
      data: passenger
    })
  } catch (error: any) {
    console.error('Error in passenger POST:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
