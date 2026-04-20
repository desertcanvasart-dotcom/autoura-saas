// ============================================
// POST /api/pricing-grid/save
// Save grid to itinerary + services (B2C/B2B)
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `ITN-S-${year}-${random}`
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase, tenant_id, user } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })
    }

    const body = await request.json()
    const { config, days, totals } = body

    if (!config || !days || !totals) {
      return NextResponse.json({ success: false, error: 'Missing config, days, or totals' }, { status: 400 })
    }

    const pax = Math.max(config.pax || 1, 1)
    const itineraryCode = generateItineraryCode()

    // Calculate dates
    const startDate = config.startDate || new Date().toISOString().split('T')[0]
    const totalDays = days.length
    const endDate = new Date(new Date(startDate).getTime() + (totalDays - 1) * 86400000).toISOString().split('T')[0]

    // 1. Create/update itinerary record
    const itineraryData: Record<string, any> = {
      tenant_id,
      itinerary_code: itineraryCode,
      client_id: config.clientId || null,
      client_name: config.clientName || null,
      client_email: config.clientEmail || null,
      client_phone: config.clientPhone || null,
      trip_name: config.tourName || `Tour ${itineraryCode}`,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      num_adults: pax,
      num_children: 0,
      tier: config.tier || 'standard',
      package_type: 'land-package',
      total_cost: totals.totalCost || 0,
      selling_price: totals.sellingPriceTotal || 0,
      margin_percent: config.marginPercent || 25,
      profit: totals.marginAmount || 0,
      currency: config.currency || 'EUR',
      status: 'draft',
      notes: `Created via Pricing Grid | ${config.clientType?.toUpperCase()} | ${pax} pax`,
    }

    // Try with new columns, fallback without
    let itinerary: any
    if (config.itineraryId) {
      // Update existing
      const { data, error } = await supabase
        .from('itineraries')
        .update(itineraryData)
        .eq('id', config.itineraryId)
        .select()
        .single()
      if (error) throw error
      itinerary = data

      // Delete old days and services
      await supabase.from('itinerary_days').delete().eq('itinerary_id', config.itineraryId)
    } else {
      // Create new
      try {
        const { data, error } = await supabase
          .from('itineraries')
          .insert({
            ...itineraryData,
            nationality: config.nationality || null,
            is_euro_passport: config.passport === 'eu',
          })
          .select()
          .single()
        if (error) throw error
        itinerary = data
      } catch (colError: any) {
        // Fallback without new columns
        if (colError.message?.includes('Could not find')) {
          const { data, error } = await supabase
            .from('itineraries')
            .insert(itineraryData)
            .select()
            .single()
          if (error) throw error
          itinerary = data
        } else {
          throw colError
        }
      }
    }

    const itineraryId = itinerary.id

    // 2. Create days
    let daysCreated = 0
    let servicesCreated = 0

    for (const day of days) {
      const dayDate = new Date(new Date(startDate).getTime() + (day.dayNumber - 1) * 86400000)
        .toISOString().split('T')[0]

      const { data: dayRecord, error: dayError } = await supabase
        .from('itinerary_days')
        .insert({
          itinerary_id: itineraryId,
          day_number: day.dayNumber,
          date: dayDate,
          title: day.title || `Day ${day.dayNumber}`,
          description: day.description || '',
          city: day.city || '',
          overnight_city: day.city || '',
        })
        .select()
        .single()

      if (dayError) {
        console.error(`Error creating day ${day.dayNumber}:`, dayError)
        continue
      }
      daysCreated++

      // 3. Create services from non-empty slots
      const services: any[] = []
      for (const slot of day.slots) {
        if (slot.resolvedRate === 0 && !slot.customAmount) continue

        const isGroup = ['route', 'guide', 'airport_services', 'hotel_services', 'tipping', 'boat_rides', 'other_group'].includes(slot.slotId)

        services.push({
          itinerary_id: itineraryId,
          day_id: dayRecord.id,
          service_type: getServiceType(slot.slotId),
          service_name: slot.label || slot.slotId.replace(/_/g, ' '),
          description: `[pricing-grid:${slot.slotId}] ${slot.label || ''}`,
          quantity: isGroup ? 1 : pax,
          unit_cost: slot.resolvedRate,
          total_cost: isGroup ? slot.resolvedRate : slot.resolvedRate * pax,
          is_included: true,
        })
      }

      if (services.length > 0) {
        const { error: svcError } = await supabase
          .from('itinerary_services')
          .insert(services)
        if (svcError) {
          console.error(`Error creating services for day ${day.dayNumber}:`, svcError)
        } else {
          servicesCreated += services.length
        }
      }
    }

    // 4. B2B: Create quote if needed
    let quoteId: string | undefined
    let redirectUrl: string | undefined

    if (config.clientType === 'b2b' && config.partnerId) {
      try {
        const adminClient = createAdminClient()
        // Generate quote number via RPC
        const { data: quoteNum } = await adminClient.rpc('generate_quote_number', {
          p_tenant_id: tenant_id,
          p_prefix: 'B2B'
        })

        const { data: quote, error: quoteError } = await supabase
          .from('b2b_quotes')
          .insert({
            tenant_id,
            itinerary_id: itineraryId,
            partner_id: config.partnerId,
            quote_number: quoteNum || `B2B-${Date.now()}`,
            tier: config.tier,
            currency: config.currency || 'EUR',
            status: 'draft',
            pricing_table: [{
              pax,
              cost_per_person: totals.costPerPerson,
              selling_per_person: totals.sellingPricePerPerson,
              total: totals.sellingPriceTotal,
            }],
            internal_notes: `Created via Pricing Grid`,
          })
          .select()
          .single()

        if (!quoteError && quote) {
          quoteId = quote.id
          redirectUrl = `/quotes/b2b/${quote.id}`
        }
      } catch (b2bError: any) {
        console.error('B2B quote creation error:', b2bError.message)
        // Non-fatal: itinerary was still saved
      }
    }

    return NextResponse.json({
      success: true,
      itineraryId,
      itineraryCode,
      daysCreated,
      servicesCreated,
      quoteId,
      redirectUrl: redirectUrl || `/itineraries/${itineraryId}`,
    })

  } catch (error: any) {
    console.error('Pricing grid save error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Save failed' },
      { status: 500 }
    )
  }
}

function getServiceType(slotId: string): string {
  const map: Record<string, string> = {
    route: 'transportation',
    guide: 'guide',
    airport_services: 'transfer',
    hotel_services: 'other',
    tipping: 'tip',
    boat_rides: 'other',
    other_group: 'other',
    accommodation: 'accommodation',
    entrance_fees: 'entrance_fee',
    flights: 'flight',
    experiences: 'other',
    meals: 'meal',
    water: 'other',
    cruise: 'accommodation',
    sleeping_trains: 'transportation',
    other_pp: 'other',
  }
  return map[slotId] || 'other'
}
