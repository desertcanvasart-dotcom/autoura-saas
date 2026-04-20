import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// PATCH /api/b2b/update-template-itinerary
// Persists itinerary edits from the calculator editor back to tour_templates
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { template_id, itinerary } = body

    if (!template_id) return NextResponse.json({ success: false, error: 'template_id is required' }, { status: 400 })
    if (!Array.isArray(itinerary)) return NextResponse.json({ success: false, error: 'itinerary must be an array' }, { status: 400 })

    const durationDays = itinerary.length
    const durationNights = Math.max(0, durationDays - 1)
    const citiesCovered = [...new Set(itinerary.map((d: any) => d.city).filter(Boolean))]

    const { error } = await supabase
      .from('tour_templates')
      .update({
        itinerary,
        duration_days: durationDays,
        duration_nights: durationNights,
        cities_covered: citiesCovered,
        updated_at: new Date().toISOString(),
      })
      .eq('id', template_id)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, duration_days: durationDays, duration_nights: durationNights, cities_covered: citiesCovered })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
