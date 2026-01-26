import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    console.log('📦 Creating booking from quote...')

    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, user } = authResult

    const adminClient = createAdminClient()
    const body = await request.json()
    const { quote_id, quote_type, deposit_percent = 30 } = body

    if (!quote_id || !quote_type) {
      return NextResponse.json(
        { success: false, error: 'quote_id and quote_type are required' },
        { status: 400 }
      )
    }

    if (!['b2c', 'b2b'].includes(quote_type)) {
      return NextResponse.json(
        { success: false, error: 'quote_type must be b2c or b2b' },
        { status: 400 }
      )
    }

    // Fetch the quote
    const quoteTable = quote_type === 'b2c' ? 'b2c_quotes' : 'b2b_quotes'
    const { data: quote, error: quoteError } = await adminClient
      .from(quoteTable)
      .select('*')
      .eq('id', quote_id)
      .eq('tenant_id', tenant_id)
      .single()

    if (quoteError || !quote) {
      console.error('Error fetching quote:', quoteError)
      return NextResponse.json(
        { success: false, error: 'Quote not found' },
        { status: 404 }
      )
    }

    // Check if quote is accepted
    if (quote.status !== 'accepted') {
      return NextResponse.json(
        { success: false, error: 'Only accepted quotes can be converted to bookings' },
        { status: 400 }
      )
    }

    // Check if booking already exists for this quote
    const { data: existingBooking } = await adminClient
      .from('bookings')
      .select('id, booking_number')
      .eq('quote_id', quote_id)
      .eq('quote_type', quote_type)
      .eq('tenant_id', tenant_id)
      .single()

    if (existingBooking) {
      return NextResponse.json(
        {
          success: false,
          error: 'Booking already exists for this quote',
          booking_number: existingBooking.booking_number,
          booking_id: existingBooking.id
        },
        { status: 409 }
      )
    }

    // Fetch the itinerary
    const { data: itinerary, error: itineraryError } = await adminClient
      .from('itineraries')
      .select('*')
      .eq('id', quote.itinerary_id)
      .eq('tenant_id', tenant_id)
      .single()

    if (itineraryError || !itinerary) {
      console.error('Error fetching itinerary:', itineraryError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Generate booking number
    const { data: bookingNumberData, error: bookingNumberError } = await adminClient
      .rpc('generate_booking_number')

    if (bookingNumberError) {
      console.error('Error generating booking number:', bookingNumberError)
      return NextResponse.json(
        { success: false, error: 'Failed to generate booking number' },
        { status: 500 }
      )
    }

    const booking_number = bookingNumberData

    // Calculate deposit and payment details
    const total_amount = quote_type === 'b2c' ? quote.selling_price : 0 // B2B pricing is in pricing_table
    const deposit_amount = (total_amount * deposit_percent) / 100
    const balance_due = total_amount

    // Create booking
    const bookingData = {
      tenant_id,
      itinerary_id: quote.itinerary_id,
      quote_id,
      quote_type,
      client_id: quote.client_id || null,
      partner_id: quote.partner_id || null,
      booking_number,
      booking_date: new Date().toISOString().split('T')[0],
      trip_name: itinerary.trip_name || `Trip to ${itinerary.client_name}`,
      start_date: itinerary.start_date,
      end_date: itinerary.end_date,
      total_days: itinerary.total_days || 0,
      num_travelers: quote_type === 'b2c' ? quote.num_travelers : 2,
      total_amount,
      currency: quote.currency || 'EUR',
      payment_terms: quote_type === 'b2c'
        ? `${deposit_percent}% deposit required, balance due 30 days before departure`
        : 'As per partner agreement',
      deposit_amount,
      deposit_percent,
      total_paid: 0,
      balance_due,
      status: 'pending_deposit',
      payment_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
      created_by: user?.id
    }

    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .insert(bookingData)
      .select()
      .single()

    if (bookingError) {
      console.error('Error creating booking:', bookingError)
      return NextResponse.json(
        { success: false, error: 'Failed to create booking', details: bookingError.message },
        { status: 500 }
      )
    }

    // Update quote status to 'confirmed' if B2C
    if (quote_type === 'b2c') {
      await adminClient
        .from('b2c_quotes')
        .update({ status: 'accepted' }) // Keep as accepted, itinerary will be marked confirmed
        .eq('id', quote_id)
    }

    // Update itinerary status to 'confirmed'
    await adminClient
      .from('itineraries')
      .update({ status: 'confirmed' })
      .eq('id', quote.itinerary_id)

    console.log('✅ Booking created:', booking_number)

    return NextResponse.json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    })
  } catch (error: any) {
    console.error('❌ Error in booking creation:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
