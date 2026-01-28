import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// ============================================
// TOUR VARIATION SERVICES API - CRUD + BULK
// File: app/api/tours/variations/[id]/services/route.ts
// ============================================

async function getRateDetails(rateType: string, rateId: string, supabase: any) {
  let result = null

  switch (rateType) {
    case 'transportation':
      const { data: transport } = await supabase
        .from('transportation_rates')
        .select('id, service_type, vehicle_type, origin_city, destination_city, base_rate_eur, base_rate_non_eur, capacity')
        .eq('id', rateId)
        .single()
      if (transport) {
        result = {
          id: transport.id,
          name: transport.service_type || transport.vehicle_type,
          rate_eur: transport.base_rate_eur,
          rate_non_eur: transport.base_rate_non_eur,
          city: transport.origin_city,
          details: `${transport.vehicle_type} (${transport.capacity} pax)`
        }
      }
      break

    case 'guide':
      const { data: guide } = await supabase
        .from('guide_rates')
        .select('id, guide_type, city, half_day_rate, full_day_rate')
        .eq('id', rateId)
        .single()
      if (guide) {
        result = {
          id: guide.id,
          name: guide.guide_type,
          rate_half_day: guide.half_day_rate,
          rate_full_day: guide.full_day_rate,
          city: guide.city,
          details: `Half: €${guide.half_day_rate} | Full: €${guide.full_day_rate}`
        }
      }
      break

    case 'activity':
      const { data: activity } = await supabase
        .from('activity_rates')
        .select('id, activity_name, activity_category, city, base_rate_eur, base_rate_non_eur')
        .eq('id', rateId)
        .single()
      if (activity) {
        result = {
          id: activity.id,
          name: activity.activity_name,
          rate_eur: activity.base_rate_eur,
          rate_non_eur: activity.base_rate_non_eur,
          city: activity.city,
          details: activity.activity_category
        }
      }
      break

    case 'meal':
      const { data: meal } = await supabase
        .from('meal_rates')
        .select('id, restaurant_name, meal_type, tier, city, base_rate_eur, base_rate_non_eur')
        .eq('id', rateId)
        .single()
      if (meal) {
        result = {
          id: meal.id,
          name: meal.restaurant_name,
          rate_eur: meal.base_rate_eur,
          rate_non_eur: meal.base_rate_non_eur,
          city: meal.city,
          details: `${meal.meal_type} - ${meal.tier}`
        }
      }
      break

    case 'accommodation':
      const { data: hotel } = await supabase
        .from('accommodation_rates')
        .select('id, hotel_name, room_type, city, rate_low_season_sgl, rate_high_season_sgl, rate_peak_season_sgl')
        .eq('id', rateId)
        .single()
      if (hotel) {
        result = {
          id: hotel.id,
          name: hotel.hotel_name,
          rate_low: hotel.rate_low_season_sgl,
          rate_high: hotel.rate_high_season_sgl,
          rate_peak: hotel.rate_peak_season_sgl,
          city: hotel.city,
          details: hotel.room_type
        }
      }
      break

    case 'cruise':
      const { data: cruise } = await supabase
        .from('nile_cruises')
        .select('id, ship_name, cabin_type, rate_low_season, rate_high_season, rate_peak_season')
        .eq('id', rateId)
        .single()
      if (cruise) {
        result = {
          id: cruise.id,
          name: cruise.ship_name,
          rate_low: cruise.rate_low_season,
          rate_high: cruise.rate_high_season,
          rate_peak: cruise.rate_peak_season,
          details: cruise.cabin_type
        }
      }
      break
  }

  return result
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const { data, error } = await supabase
      .from('tour_variation_services')
      .select('*')
      .eq('variation_id', id)
      .order('sequence_order')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const enrichedServices = await Promise.all((data || []).map(async (service) => {
      if (service.rate_type && service.rate_id) {
        const rateDetails = await getRateDetails(service.rate_type, service.rate_id, supabase)
        return { ...service, rate_details: rateDetails }
      }
      return { ...service, rate_details: null }
    }))

    return NextResponse.json({ success: true, data: enrichedServices })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Verify variation belongs to this tenant
    const { data: variation } = await supabase
      .from('tour_variations')
      .select('id, tenant_id')
      .eq('id', id)
      .single()

    if (!variation) {
      return NextResponse.json(
        { success: false, error: 'Variation not found or access denied' },
        { status: 404 }
      )
    }

    if (variation.tenant_id !== tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Cannot create service for variation from another tenant' },
        { status: 403 }
      )
    }

    const { data: maxSeq } = await supabase
      .from('tour_variation_services')
      .select('sequence_order')
      .eq('variation_id', id)
      .order('sequence_order', { ascending: false })
      .limit(1)
      .single()

    const nextOrder = (maxSeq?.sequence_order || 0) + 1

    const { data, error } = await supabase
      .from('tour_variation_services')
      .insert({
        tenant_id, // ✅ Explicit tenant_id
        variation_id: id,
        service_name: body.service_name,
        service_category: body.service_category,
        rate_type: body.rate_type,
        rate_id: body.rate_id,
        quantity_mode: body.quantity_mode || 'per_pax',
        quantity_value: body.quantity_value || 1,
        cost_per_unit: body.cost_per_unit,
        day_number: body.day_number,
        is_optional: body.is_optional || false,
        optional_price_override: body.optional_price_override,
        notes: body.notes,
        sequence_order: body.sequence_order || nextOrder
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication - RLS will enforce tenant boundaries
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()
    const { services, mode } = body

    if (!Array.isArray(services)) {
      return NextResponse.json({ error: 'services array is required' }, { status: 400 })
    }

    // Mode: 'replace' = delete all and re-insert (default for ServiceLinkerModal)
    // Mode: 'update' = update existing by ID
    if (mode === 'update') {
      // Update existing services by ID
      const results = await Promise.all(services.map(async (service: any) => {
        const updateData: any = {
          service_name: service.service_name,
          service_category: service.service_category,
          rate_type: service.rate_type,
          rate_id: service.rate_id,
          quantity_mode: service.quantity_mode,
          quantity_value: service.quantity_value,
          cost_per_unit: service.cost_per_unit,
          day_number: service.day_number,
          is_optional: service.is_optional,
          optional_price_override: service.optional_price_override,
          notes: service.notes,
          sequence_order: service.sequence_order
        }

        // Do NOT include tenant_id in update (prevents tenant switching)
        delete updateData.tenant_id

        const { data, error } = await supabase
          .from('tour_variation_services')
          .update(updateData)
          .eq('id', service.id)
          .eq('variation_id', id)
          .select()
          .single()

        return { success: !error, data, error }
      }))

      const hasErrors = results.some(r => !r.success)
      return NextResponse.json({
        success: !hasErrors,
        data: results.filter(r => r.data).map(r => r.data),
        errors: results.filter(r => r.error).map(r => r.error)
      })
    } else {
      // Default: Replace all services (delete existing, insert new)
      // Step 1: Delete all existing services for this variation
      const { error: deleteError } = await supabase
        .from('tour_variation_services')
        .delete()
        .eq('variation_id', id)

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
      }

      // Step 2: Insert all new services
      if (services.length > 0) {
        const servicesWithVariation = services.map((service: any, index: number) => ({
          tenant_id, // ✅ Explicit tenant_id
          variation_id: id,
          service_name: service.service_name,
          service_category: service.service_category,
          rate_type: service.rate_type || null,
          rate_id: service.rate_id || null,
          quantity_mode: service.quantity_mode || 'per_pax',
          quantity_value: service.quantity_value || 1,
          cost_per_unit: service.cost_per_unit || 0,
          day_number: service.day_number || null,
          is_optional: service.is_optional || false,
          optional_price_override: service.optional_price_override || null,
          notes: service.notes || null,
          sequence_order: service.sequence_order || index + 1
        }))

        const { error: insertError } = await supabase
          .from('tour_variation_services')
          .insert(servicesWithVariation)

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 })
        }
      }

      // Fetch and return updated services
      const { data, error } = await supabase
        .from('tour_variation_services')
        .select('*')
        .eq('variation_id', id)
        .order('sequence_order')

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        data,
        message: `${services.length} services saved`
      })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication - RLS will enforce tenant boundaries
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
    const { searchParams } = new URL(request.url)
    const serviceId = searchParams.get('serviceId')

    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('tour_variation_services')
      .delete()
      .eq('id', serviceId)
      .eq('variation_id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Service deleted' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}