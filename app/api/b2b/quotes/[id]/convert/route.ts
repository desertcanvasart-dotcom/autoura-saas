import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// B2B QUOTE CONVERT TO ITINERARY API
// File: app/api/b2b/quotes/[id]/convert/route.ts
// ============================================

// Lazy-initialized Supabase admin client (avoids build-time errors)
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _supabaseAdmin
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { user_id } = body

    const { data: quote, error: quoteError } = await supabaseAdmin
      .from('tour_quotes')
      .select(`
        *,
        tour_variations (
          id, variation_name, variation_code, tier, group_type, inclusions, exclusions,
          tour_templates (
            id, template_name, template_code, duration_days, duration_nights, cities_covered,
            tour_days (id, day_number, title, description, city, overnight_city, meals_included)
          )
        ),
        b2b_partners (company_name, partner_code)
      `)
      .eq('id', id)
      .single()

    if (quoteError || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    if (quote.converted_to_itinerary_id) {
      return NextResponse.json(
        { error: 'Quote already converted', itinerary_id: quote.converted_to_itinerary_id },
        { status: 400 }
      )
    }

    const template = quote.tour_variations?.tour_templates
    const variation = quote.tour_variations

    // Create or find client
    let clientId = null
    if (quote.client_email) {
      const { data: existingClient } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('email', quote.client_email)
        .single()

      if (existingClient) {
        clientId = existingClient.id
      } else {
        const nameParts = (quote.client_name || '').split(' ')
        const { data: newClient } = await supabaseAdmin
          .from('clients')
          .insert({
            first_name: nameParts[0] || 'Unknown',
            last_name: nameParts.slice(1).join(' ') || '',
            email: quote.client_email,
            phone: quote.client_phone,
            nationality: quote.client_nationality,
            source: 'b2b_quote',
            notes: `Created from B2B quote ${quote.quote_number}`
          })
          .select()
          .single()

        if (newClient) clientId = newClient.id
      }
    }

    // Generate itinerary code
    const year = new Date().getFullYear().toString().slice(-2)
    const { count } = await supabaseAdmin.from('itineraries').select('*', { count: 'exact', head: true })
    const itineraryNumber = ((count || 0) + 1).toString().padStart(3, '0')
    const itineraryCode = `ITN-${year}-${itineraryNumber}`

    const startDate = quote.travel_date ? new Date(quote.travel_date) : new Date()
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + (template?.duration_days || 1) - 1)

    const { data: itinerary, error: itinError } = await supabaseAdmin
      .from('itineraries')
      .insert({
        itinerary_code: itineraryCode,
        client_id: clientId,
        client_name: quote.client_name || 'B2B Client',
        trip_name: template?.template_name || 'Tour Package',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        total_days: template?.duration_days || 1,
        num_adults: quote.num_adults,
        num_children: quote.num_children || 0,
        status: 'quoted',
        package_type: 'custom',
        tier: variation?.tier || 'standard',
        total_cost: quote.selling_price,
        supplier_cost: quote.total_cost,
        profit: quote.margin_amount,
        margin_percent: quote.margin_percent,
        currency: quote.currency || 'EUR',
        deposit_amount: Math.round((quote.selling_price || 0) * 0.3),
        balance_due: Math.round((quote.selling_price || 0) * 0.7),
        payment_status: 'not_paid',
        created_by: user_id,
        notes: `Converted from B2B quote ${quote.quote_number}`
      })
      .select()
      .single()

    if (itinError || !itinerary) {
      return NextResponse.json({ error: 'Failed to create itinerary' }, { status: 500 })
    }

    // Create itinerary days
    const tourDays = template?.tour_days || []
    
    for (let dayNum = 1; dayNum <= (template?.duration_days || 1); dayNum++) {
      const tourDay = tourDays.find((d: any) => d.day_number === dayNum)
      const dayDate = new Date(startDate)
      dayDate.setDate(dayDate.getDate() + dayNum - 1)

      const { data: itinDay } = await supabaseAdmin
        .from('itinerary_days')
        .insert({
          itinerary_id: itinerary.id,
          day_number: dayNum,
          date: dayDate.toISOString().split('T')[0],
          title: tourDay?.title || `Day ${dayNum}`,
          description: tourDay?.description || '',
          city: tourDay?.city || '',
          overnight_location: tourDay?.overnight_city || ''
        })
        .select()
        .single()

      if (!itinDay) continue

      const servicesSnapshot = quote.services_snapshot || []
      
      for (const service of servicesSnapshot) {
        if (service.day_number && service.day_number !== dayNum) continue
        if (!service.day_number && dayNum > 1) continue

        await supabaseAdmin
          .from('itinerary_services')
          .insert({
            itinerary_day_id: itinDay.id,
            service_type: service.service_category || 'other',
            service_name: service.service_name,
            supplier_cost: service.line_total / (service.quantity || 1),
            quantity: service.quantity || 1,
            total_cost: service.line_total,
            margin_percent: quote.margin_percent,
            selling_price: service.line_total * (1 + (quote.margin_percent || 25) / 100),
            currency: 'EUR',
            status: 'pending'
          })
      }
    }

    await supabaseAdmin
      .from('tour_quotes')
      .update({
        status: 'converted',
        converted_to_itinerary_id: itinerary.id,
        converted_at: new Date().toISOString()
      })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      data: {
        itinerary_id: itinerary.id,
        itinerary_code: itineraryCode,
        quote_number: quote.quote_number,
        message: 'Quote successfully converted to itinerary'
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}