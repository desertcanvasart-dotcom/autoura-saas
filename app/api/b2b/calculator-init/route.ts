import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// GET /api/b2b/calculator-init?variation_id=...
// Resolves variation → template data for the B2B calculator editor
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const variationId = request.nextUrl.searchParams.get('variation_id')
    if (!variationId) return NextResponse.json({ success: false, error: 'variation_id is required' }, { status: 400 })

    const { data: variation, error } = await supabase
      .from('tour_variations')
      .select(`id, variation_name, variation_code, tier, template_id, tour_templates (id, template_name, template_code, itinerary, duration_days, duration_nights, cities_covered)`)
      .eq('id', variationId)
      .single()

    if (error || !variation) return NextResponse.json({ success: false, error: 'Variation not found' }, { status: 404 })

    const template = variation.tour_templates as any
    if (!template) return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 })

    return NextResponse.json({
      success: true,
      template_id: template.id,
      template_name: template.template_name,
      template_code: template.template_code,
      variation_name: variation.variation_name,
      variation_code: variation.variation_code,
      tier: variation.tier,
      duration_days: template.duration_days,
      duration_nights: template.duration_nights,
      cities_covered: template.cities_covered || [],
      itinerary: template.itinerary || [],
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
