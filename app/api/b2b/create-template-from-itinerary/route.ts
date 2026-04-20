import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// POST /api/b2b/create-template-from-itinerary
// Converts a parsed itinerary into tour_template + tour_variation for B2B pricing
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
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
    const { data: services } = await supabase
      .from('itinerary_services').select('day_id, service_type, service_name').in('day_id', dayIds)

    const servicesByDay: Record<string, any[]> = {}
    for (const svc of (services || [])) {
      if (!servicesByDay[svc.day_id]) servicesByDay[svc.day_id] = []
      servicesByDay[svc.day_id].push(svc)
    }

    // 4. Build template itinerary JSONB
    const templateItinerary = days.map((day, index) => {
      const daySvcs = servicesByDay[day.id] || []
      const meals: string[] = ['breakfast']
      if (daySvcs.some((s: any) => s.service_type === 'meal' && s.service_name?.toLowerCase().includes('lunch'))) meals.push('lunch')
      if (daySvcs.some((s: any) => s.service_type === 'meal' && s.service_name?.toLowerCase().includes('dinner'))) meals.push('dinner')

      const isCruiseDay = daySvcs.some((s: any) => s.service_type === 'cruise') || day.is_cruise_day
      const hasGuide = daySvcs.some((s: any) => s.service_type === 'guide')
      const isFirst = index === 0, isLast = index === days.length - 1

      let accommodationType = 'hotel'
      if (isCruiseDay) accommodationType = 'cruise'
      else if (isLast && !daySvcs.some((s: any) => s.service_type === 'accommodation' || s.service_type === 'cruise')) accommodationType = 'none'

      return {
        day: day.day_number,
        title: day.title || `Day ${day.day_number}`,
        description: day.description || '',
        meals,
        city: day.city || 'Cairo',
        is_cruise_day: isCruiseDay,
        attractions: day.attractions || [],
        overnight_city: day.overnight_city || null,
        accommodation_type: accommodationType,
        services: {
          airport_arrival: isFirst && daySvcs.some((s: any) => s.service_type === 'airport_service' || s.service_type === 'airport_services'),
          airport_departure: isLast && daySvcs.some((s: any) => s.service_type === 'airport_service' || s.service_type === 'airport_services'),
          hotel_checkin: isFirst && daySvcs.some((s: any) => s.service_type === 'hotel_service' || s.service_type === 'hotel_services'),
          hotel_checkout: isLast && daySvcs.some((s: any) => s.service_type === 'hotel_service' || s.service_type === 'hotel_services'),
          guide_required: day.guide_required ?? hasGuide,
        },
      }
    })

    // 5. Create template
    const cities = [...new Set(days.map(d => d.city).filter(Boolean))]
    const totalDays = itinerary.total_days || days.length
    const cityPrefix = (cities[0] || 'EGY').substring(0, 3).toUpperCase()
    const templateCode = `${cityPrefix}-MUL-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
    const tripName = itinerary.trip_name || 'Custom Tour'

    const { data: template, error: templateError } = await supabase
      .from('tour_templates')
      .insert({
        tenant_id,
        template_code: templateCode,
        template_name: tripName,
        tour_type: totalDays <= 1 ? 'day_tour' : 'multi_day',
        duration_days: totalDays,
        duration_nights: Math.max(totalDays - 1, 0),
        cities_covered: cities,
        short_description: 'Custom tour created from itinerary',
        itinerary: templateItinerary,
        is_active: true,
        is_featured: false,
      })
      .select().single()

    if (templateError || !template) {
      return NextResponse.json({ success: false, error: templateError?.message || 'Failed to create template' }, { status: 500 })
    }

    // 6. Create variation
    const variationName = `${tripName} - ${tier.charAt(0).toUpperCase() + tier.slice(1)}`
    const variationCode = `${templateCode}-${tier.toUpperCase()}`

    const { data: variation, error: varError } = await supabase
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
