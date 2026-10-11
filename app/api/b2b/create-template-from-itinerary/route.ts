import { dayTripFromItineraryDay } from '@/lib/pricing/day-trip'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { roleDenied } from '@/lib/api-role-gate'

// POST /api/b2b/create-template-from-itinerary
// Converts a parsed itinerary into tour_template + tour_variation for B2B pricing
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const denied = roleDenied(authResult.role, 'manage')
    if (denied) return denied
    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { itinerary_id, tier = 'standard' } = body
    if (!itinerary_id) return NextResponse.json({ success: false, error: 'itinerary_id is required' }, { status: 400 })

    // 1. Fetch itinerary
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries').select('*').eq('id', itinerary_id).single()
    if (itinError || !itinerary) return NextResponse.json({ success: false, error: 'Itinerary not found' }, { status: 404 })

    // 2. Fetch days
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days').select('*').eq('itinerary_id', itinerary_id).order('day_number')
    if (daysError || !days?.length) return NextResponse.json({ success: false, error: 'No days found' }, { status: 404 })

    // 3. Fetch services
    const dayIds = days.map(d => d.id)
    // The grid files its lines under itinerary_day_id (older rows: day_id).
    // Reading day_id alone found none of them, so every grid trip's template
    // came out with no airport or hotel services and no restaurant meals.
    const { data: services } = await supabase
      .from('itinerary_services')
      .select('day_id, itinerary_day_id, service_type, service_name, description')
      .or(`itinerary_day_id.in.(${dayIds.join(',')}),day_id.in.(${dayIds.join(',')})`)

    const servicesByDay: Record<string, any[]> = {}
    for (const svc of (services || [])) {
      const dayId = svc.itinerary_day_id ?? svc.day_id
      if (!dayId) continue
      if (!servicesByDay[dayId]) servicesByDay[dayId] = []
      servicesByDay[dayId].push(svc)
    }
    // Airport and hotel services are saved as 'transfer' / 'other'; the grid
    // tags each line with its slot, which says which they were.
    const isSlot = (s: any, slot: string, ...types: string[]) =>
      String(s.description ?? '').includes(`[pricing-grid:${slot}]`) || types.includes(s.service_type)

    // 4. Build template itinerary JSONB
    const templateItinerary = days.map((day, index) => {
      const daySvcs = servicesByDay[day.id] || []
      // The object form, and each meal STATED. The list form
      // (['breakfast','lunch']) read as "included in the hotel" everywhere
      // downstream, so a restaurant lunch or dinner carried over from the
      // Quote Builder was never charged. A meal service on the day means the
      // travellers eat out: 'external', which the engine prices from
      // Rates → Meals.
      const hasMeal = (name: string) =>
        daySvcs.some((s: any) => s.service_type === 'meal' && s.service_name?.toLowerCase().includes(name))
      const meals = {
        breakfast: 'included',
        lunch: hasMeal('lunch') ? 'external' : 'none',
        dinner: hasMeal('dinner') ? 'external' : 'none',
      }

      const isCruiseDay = daySvcs.some((s: any) => s.service_type === 'cruise' || String(s.description ?? '').includes('[pricing-grid:cruise]')) || day.is_cruise_day
      const hasGuide = daySvcs.some((s: any) => s.service_type === 'guide')
      const isFirst = index === 0, isLast = index === days.length - 1

      let accommodationType = 'hotel'
      if (isCruiseDay) accommodationType = 'cruise'
      else if (isLast && !daySvcs.some((s: any) => s.service_type === 'accommodation' || s.service_type === 'cruise')) accommodationType = 'none'

      const tripFrom = dayTripFromItineraryDay(day, accommodationType)
      return {
        day: day.day_number,
        title: day.title || `Day ${day.day_number}`,
        description: day.description || '',
        meals,
        // The day's own place — never Cairo for a day that names none.
        city: day.city || day.overnight_city || '',
        is_cruise_day: isCruiseDay,
        attractions: day.attractions || [],
        overnight_city: day.overnight_city || null,
        // The night is somewhere other than the day's city on a road day: a
        // day trip from there (lib/pricing/day-trip), priced as one.
        ...(tripFrom ? { day_trip_from: tripFrom } : {}),
        accommodation_type: accommodationType,
        services: {
          airport_arrival: isFirst && daySvcs.some((s: any) => isSlot(s, 'airport_services', 'airport_service', 'airport_services')),
          airport_departure: isLast && daySvcs.some((s: any) => isSlot(s, 'airport_services', 'airport_service', 'airport_services')),
          hotel_checkin: isFirst && daySvcs.some((s: any) => isSlot(s, 'hotel_services', 'hotel_service', 'hotel_services')),
          hotel_checkout: isLast && daySvcs.some((s: any) => isSlot(s, 'hotel_services', 'hotel_service', 'hotel_services')),
          guide_required: day.guide_required ?? hasGuide,
        },
      }
    })

    // 5. Create template
    const cities = [...new Set(days.map(d => d.city).filter((c): c is string => c !== null))]
    const totalDays = itinerary.total_days || days.length
    // One template per itinerary, named by its code: "Update B2B Quote" made a
    // new template (and variation) on every save, under a random three-digit
    // code that could also collide with one already there.
    const templateCode = `TPL-${itinerary.itinerary_code}`.slice(0, 50)
    const tripName = itinerary.trip_name || 'Custom Tour'
    const templateFields = {
        template_name: tripName,
        tour_type: totalDays <= 1 ? 'day_tour' : 'multi_day',
        duration_days: totalDays,
        duration_nights: Math.max(totalDays - 1, 0),
        cities_covered: cities,
        short_description: 'Custom tour created from itinerary',
        itinerary: templateItinerary,
        is_active: true,
    }
    const { data: existingTemplate } = await supabase
      .from('tour_templates').select('id')
      .eq('tenant_id', tenant_id).eq('template_code', templateCode)
      .maybeSingle()
    const { data: template, error: templateError } = existingTemplate
      ? await supabase.from('tour_templates').update(templateFields).eq('id', existingTemplate.id).select().single()
      : await supabase.from('tour_templates')
          .insert({ ...templateFields, tenant_id, template_code: templateCode, is_featured: false })
          .select().single()

    if (templateError || !template) {
      return NextResponse.json({ success: false, error: templateError?.message || 'Failed to create template' }, { status: 500 })
    }

    // 6. Create variation
    const variationName = `${tripName} - ${tier.charAt(0).toUpperCase() + tier.slice(1)}`
    const variationCode = `${templateCode}-${tier.toUpperCase()}`

    const { data: existingVariation } = await supabase
      .from('tour_variations').select('id')
      .eq('tenant_id', tenant_id).eq('template_id', template.id).eq('variation_code', variationCode)
      .maybeSingle()
    const { data: variation, error: varError } = existingVariation
      ? { data: existingVariation, error: null }
      : await supabase
      .from('tour_variations')
      .insert({
        tenant_id,
        template_id: template.id,
        variation_code: variationCode,
        variation_name: variationName,
        tier,
        group_type: 'private',
        min_pax: 1,
        max_pax: 40,
        is_active: true,
      })
      .select().single()

    if (varError || !variation) {
      return NextResponse.json({ success: false, error: varError?.message || 'Failed to create variation' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        template_id: template.id,
        template_code: templateCode,
        template_name: tripName,
        variation_id: variation.id,
        variation_code: variationCode,
        variation_name: variationName,
        itinerary_id,
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating template from itinerary:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
