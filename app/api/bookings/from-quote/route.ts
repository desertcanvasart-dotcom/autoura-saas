import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { b2bNumTravelers, b2bTotalAmount, calculatorTripFacts } from '@/lib/bookings/from-quote-facts'
import type { Tables, TablesInsert } from '@/types/database.types'

export async function POST(request: NextRequest) {
  try {


    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, user } = authResult

    const adminClient = createAdminClient()
    const body = await request.json()
    const { quote_id, quote_type, deposit_percent = 30 } = body

    // Unvalidated, this reached `(total_amount * deposit_percent) / 100`
    // straight from the request body: -50 produces a negative deposit, 500
    // charges five times the trip.
    if (typeof deposit_percent !== 'number' || !Number.isFinite(deposit_percent) ||
        deposit_percent < 0 || deposit_percent > 100) {
      return NextResponse.json(
        { success: false, error: 'deposit_percent must be a number between 0 and 100' },
        { status: 400 }
      )
    }

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

    // Fetch the quote (separate typed queries — the two tables share almost
    // no pricing columns, so the narrowed vars are used where shapes differ)
    let b2cQuote: Tables<'b2c_quotes'> | null = null
    let b2bQuote: Tables<'b2b_quotes'> | null = null

    if (quote_type === 'b2c') {
      const { data, error } = await adminClient
        .from('b2c_quotes')
        .select('*')
        .eq('id', quote_id)
        .eq('tenant_id', tenant_id)
        .single()
      if (error) console.error('Error fetching quote:', error)
      b2cQuote = data
    } else {
      const { data, error } = await adminClient
        .from('b2b_quotes')
        .select('*')
        .eq('id', quote_id)
        .eq('tenant_id', tenant_id)
        .single()
      if (error) console.error('Error fetching quote:', error)
      b2bQuote = data
    }

    const quote = b2cQuote ?? b2bQuote
    if (!quote) {
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

    // Fast path only — this cannot be the guarantee. Two concurrent requests
    // both see "no booking" and both insert; the unique index from migration
    // 256 is what actually prevents two bookings (and two deposits) for one
    // quote. The error is captured because a failed SELECT previously looked
    // exactly like "no booking exists".
    const { data: existingBooking, error: existingErr } = await adminClient
      .from('bookings')
      .select('id, booking_number')
      .eq('quote_id', quote_id)
      .eq('quote_type', quote_type)
      .eq('tenant_id', tenant_id)
      .single()

    // PGRST116 = no rows, which is the normal path here.
    if (existingErr && existingErr.code !== 'PGRST116') {
      console.error('Error checking for an existing booking:', existingErr)
      return NextResponse.json(
        { success: false, error: 'Could not verify whether this quote is already booked' },
        { status: 500 }
      )
    }

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

    // Fetch the itinerary. B2C quotes always have one; B2B quotes saved from
    // the CALCULATOR deliberately do not (migration 270: "calculator quotes
    // have no itinerary_id") — those book from the quote's own facts below.
    const itinerary_id = quote.itinerary_id
    if (!itinerary_id && quote_type === 'b2c') {
      return NextResponse.json(
        { success: false, error: 'Quote has no linked itinerary' },
        { status: 404 }
      )
    }

    let itinerary: Tables<'itineraries'> | null = null
    if (itinerary_id) {
      const { data, error: itineraryError } = await adminClient
        .from('itineraries')
        .select('*')
        .eq('id', itinerary_id)
        .eq('tenant_id', tenant_id)
        .single()

      if (itineraryError || !data) {
        console.error('Error fetching itinerary:', itineraryError)
        return NextResponse.json(
          { success: false, error: 'Itinerary not found' },
          { status: 404 }
        )
      }
      itinerary = data
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

    // The frozen money and pax, from what the quote actually holds. This used
    // to write B2B bookings with total_amount = 0 ("pricing is in
    // pricing_table") and num_travelers = 2 — stale since migration 270 gave
    // b2b_quotes real selling_price/num_adults/num_children. A quote that
    // holds no usable figure is refused, never frozen as zero.
    let total_amount: number
    let num_travelers: number
    if (b2cQuote) {
      total_amount = b2cQuote.selling_price
      num_travelers = b2cQuote.num_travelers
    } else {
      const pax = b2bNumTravelers(b2bQuote!)
      if (!pax.ok) {
        return NextResponse.json({ success: false, error: pax.error }, { status: 400 })
      }
      const total = b2bTotalAmount(b2bQuote!, pax.value)
      if (!total.ok) {
        return NextResponse.json({ success: false, error: total.error }, { status: 400 })
      }
      num_travelers = pax.value
      total_amount = total.value
    }

    const deposit_amount = (total_amount * deposit_percent) / 100
    const balance_due = total_amount

    // Trip facts: from the itinerary when there is one, else (calculator
    // quote) from the quote's travel date plus its programme's duration.
    let tripFacts: { trip_name: string; start_date: string; end_date: string; total_days: number }
    if (itinerary) {
      // Bookings require concrete dates; an itinerary without them cannot be booked.
      if (!itinerary.start_date || !itinerary.end_date) {
        return NextResponse.json(
          { success: false, error: 'Itinerary is missing start or end date' },
          { status: 400 }
        )
      }
      tripFacts = {
        trip_name: itinerary.trip_name || `Trip to ${itinerary.client_name}`,
        start_date: itinerary.start_date,
        end_date: itinerary.end_date,
        total_days: itinerary.total_days || 0,
      }
    } else {
      const variationId = b2bQuote!.variation_id
      if (!variationId) {
        return NextResponse.json(
          {
            success: false,
            error: 'This quote has neither an itinerary nor a tour variation — it cannot be converted to a booking.',
          },
          { status: 400 }
        )
      }
      const { data: variationRow } = await adminClient
        .from('tour_variations')
        .select('variation_name, tour_templates (template_name, duration_days)')
        .eq('id', variationId)
        .eq('tenant_id', tenant_id)
        .maybeSingle()

      const facts = calculatorTripFacts({
        trip_name: b2bQuote!.trip_name,
        travel_date: b2bQuote!.travel_date,
        variation: variationRow
          ? {
              variation_name: variationRow.variation_name,
              template_name: variationRow.tour_templates?.template_name ?? null,
              duration_days: variationRow.tour_templates?.duration_days ?? null,
            }
          : null,
      })
      if (!facts.ok) {
        return NextResponse.json({ success: false, error: facts.error }, { status: 400 })
      }
      tripFacts = facts.value
    }

    // Create booking
    const bookingData: TablesInsert<'bookings'> = {
      tenant_id,
      itinerary_id: itinerary_id ?? null,
      quote_id,
      quote_type,
      client_id: b2cQuote?.client_id ?? null,
      partner_id: b2bQuote?.partner_id ?? null,
      booking_number,
      booking_date: new Date().toISOString().split('T')[0],
      trip_name: tripFacts.trip_name,
      start_date: tripFacts.start_date,
      end_date: tripFacts.end_date,
      total_days: tripFacts.total_days,
      num_travelers,
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
      // 23505 on uq_bookings_one_per_quote: someone converted this quote
      // between our check and our insert. Return THEIR booking — the caller
      // wanted this quote booked, and it is.
      if (bookingError.code === '23505') {
        const { data: raced } = await adminClient
          .from('bookings')
          .select('id, booking_number')
          .eq('quote_id', quote_id)
          .eq('quote_type', quote_type)
          .eq('tenant_id', tenant_id)
          .maybeSingle()

        if (raced) {
          return NextResponse.json(
            {
              success: false,
              error: 'Booking already exists for this quote',
              booking_number: raced.booking_number,
              booking_id: raced.id,
            },
            { status: 409 }
          )
        }
      }

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

    // Update itinerary status to 'confirmed' (calculator quotes have none)
    if (itinerary_id) {
      await adminClient
        .from('itineraries')
        .update({ status: 'confirmed' })
        .eq('id', itinerary_id)
    }



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
