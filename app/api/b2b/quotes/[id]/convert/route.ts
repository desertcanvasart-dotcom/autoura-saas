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

    const { data: quote, error: quoteError } = await getSupabaseAdmin()
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

    const q = quote as any

    if (q.converted_to_itinerary_id) {
      return NextResponse.json(
        { error: 'Quote already converted', itinerary_id: q.converted_to_itinerary_id },
        { status: 400 }
      )
    }

    const template = q.tour_variations?.tour_templates
    const variation = q.tour_variations

    // Create or find client
    let clientId = null
    if (q.client_email) {
      const { data: existingClient } = await getSupabaseAdmin()
        .from('clients')
        .select('id')
        .eq('email', q.client_email)
        .single()

      if (existingClient) {
        clientId = (existingClient as any).id
      } else {
        const nameParts = (q.client_name || '').split(' ')
        const { data: newClient } = await (getSupabaseAdmin() as any)
          .from('clients')
          .insert({
            first_name: nameParts[0] || 'Unknown',
            last_name: nameParts.slice(1).join(' ') || '',
            email: q.client_email,
            phone: q.client_phone,
            nationality: q.client_nationality,
            source: 'b2b_quote',
            notes: `Created from B2B quote ${q.quote_number}`
          } as any)
          .select()
          .single()

        if (newClient) clientId = (newClient as any).id
      }
    }

    // Generate itinerary code
    const year = new Date().getFullYear().toString().slice(-2)
    const { count } = await getSupabaseAdmin().from('itineraries').select('*', { count: 'exact', head: true })
    const itineraryNumber = ((count || 0) + 1).toString().padStart(3, '0')
    const itineraryCode = `ITN-${year}-${itineraryNumber}`

    const startDate = q.travel_date ? new Date(q.travel_date) : new Date()
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + (template?.duration_days || 1) - 1)

    const { data: itinerary, error: itinError } = await (getSupabaseAdmin() as any)
      .from('itineraries')
      .insert({
        itinerary_code: itineraryCode,
        client_id: clientId,
        client_name: q.client_name || 'B2B Client',
        trip_name: template?.template_name || 'Tour Package',
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        total_days: template?.duration_days || 1,
        num_adults: q.num_adults,
        num_children: q.num_children || 0,
        status: 'quoted',
        package_type: 'custom',
        tier: variation?.tier || 'standard',
        total_cost: q.selling_price,
        supplier_cost: q.total_cost,
        profit: q.margin_amount,
        margin_percent: q.margin_percent,
        currency: q.currency || 'EUR',
        deposit_amount: Math.round((q.selling_price || 0) * 0.3),
        balance_due: Math.round((q.selling_price || 0) * 0.7),
        payment_status: 'not_paid',
        created_by: user_id,
        notes: `Converted from B2B quote ${q.quote_number}`
      } as any)
      .select()
      .single()

    if (itinError || !itinerary) {
      return NextResponse.json({ error: 'Failed to create itinerary' }, { status: 500 })
    }

    const itin = itinerary as any

    // Create itinerary days
    const tourDays = template?.tour_days || []
    
    for (let dayNum = 1; dayNum <= (template?.duration_days || 1); dayNum++) {
      const tourDay = tourDays.find((d: any) => d.day_number === dayNum)
      const dayDate = new Date(startDate)
      dayDate.setDate(dayDate.getDate() + dayNum - 1)

      const { data: itinDay } = await (getSupabaseAdmin() as any)
        .from('itinerary_days')
        .insert({
          itinerary_id: itin.id,
          day_number: dayNum,
          date: dayDate.toISOString().split('T')[0],
          title: tourDay?.title || `Day ${dayNum}`,
          description: tourDay?.description || '',
          city: tourDay?.city || '',
          overnight_location: tourDay?.overnight_city || ''
        } as any)
        .select()
        .single()

      if (!itinDay) continue

      const servicesSnapshot = q.services_snapshot || []
      
      for (const service of servicesSnapshot) {
        if (service.day_number && service.day_number !== dayNum) continue
        if (!service.day_number && dayNum > 1) continue

        await (getSupabaseAdmin() as any)
          .from('itinerary_services')
          .insert({
            itinerary_day_id: (itinDay as any).id,
            service_type: service.service_category || 'other',
            service_name: service.service_name,
            supplier_cost: service.line_total / (service.quantity || 1),
            quantity: service.quantity || 1,
            total_cost: service.line_total,
            margin_percent: q.margin_percent,
            selling_price: service.line_total * (1 + (q.margin_percent || 25) / 100),
            currency: 'EUR',
            status: 'pending'
          } as any)
      }
    }

    await (getSupabaseAdmin() as any)
      .from('tour_quotes')
      .update({
        status: 'converted',
        converted_to_itinerary_id: itin.id,
        converted_at: new Date().toISOString()
      })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      data: {
        itinerary_id: itin.id,
        itinerary_code: itineraryCode,
        quote_number: q.quote_number,
        message: 'Quote successfully converted to itinerary'
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}