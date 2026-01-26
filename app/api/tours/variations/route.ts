import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - List all variations (optionally filter by template_id)
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('template_id')

    let query = supabase
      .from('tour_variations')
      .select('*')
      .order('tier', { ascending: true })

    if (templateId) {
      query = query.eq('template_id', templateId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching variations:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch variations' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    })

  } catch (error) {
    console.error('Error in variations GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new variation(s) - SUPPORTS BATCH CREATION
export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    const body = await request.json()

    // Support both single variation and batch creation
    const variations = Array.isArray(body) ? body : [body]

    if (variations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No variations provided' },
        { status: 400 }
      )
    }

    // Validate required fields for each variation
    for (const v of variations) {
      if (!v.template_id) {
        return NextResponse.json(
          { success: false, error: 'template_id is required for all variations' },
          { status: 400 }
        )
      }
      if (!v.variation_name) {
        return NextResponse.json(
          { success: false, error: 'variation_name is required for all variations' },
          { status: 400 }
        )
      }
      if (!v.tier) {
        return NextResponse.json(
          { success: false, error: 'tier is required (budget, standard, or luxury)' },
          { status: 400 }
        )
      }

      // Verify template belongs to this tenant
      const { data: template } = await supabase
        .from('tour_templates')
        .select('id, tenant_id')
        .eq('id', v.template_id)
        .single()

      if (!template) {
        return NextResponse.json(
          { success: false, error: 'Template not found or access denied' },
          { status: 404 }
        )
      }

      if (template.tenant_id !== tenant_id) {
        return NextResponse.json(
          { success: false, error: 'Cannot create variation for template from another tenant' },
          { status: 403 }
        )
      }
    }

    // Prepare variation data with smart defaults
    const variationsToInsert = variations.map(v => {
      // Generate variation code
      const variationCode = v.variation_code ||
        `${v.variation_name.toUpperCase().replace(/\s+/g, '-').substring(0, 20)}-${v.tier.toUpperCase()}`

      return {
        tenant_id, // ✅ Explicit tenant_id
        template_id: v.template_id,
        variation_code: variationCode,
        variation_name: v.variation_name,
        tier: v.tier,
        group_type: v.group_type || getDefaultGroupType(v.tier),
        min_pax: v.min_pax || getDefaultMinPax(v.tier),
        max_pax: v.max_pax || getDefaultMaxPax(v.tier),
        optimal_pax: v.optimal_pax || null,
        inclusions: v.inclusions || getDefaultInclusions(v.tier),
        exclusions: v.exclusions || getDefaultExclusions(),
        optional_extras: v.optional_extras || [],
        guide_type: v.guide_type || 'egyptologist',
        guide_languages: v.guide_languages || ['English'],
        vehicle_type: v.vehicle_type || getDefaultVehicle(v.tier),
        accommodation_standard: v.accommodation_standard || getDefaultAccommodation(v.tier),
        meal_quality: v.meal_quality || getDefaultMealQuality(v.tier),
        private_experience: v.private_experience ?? (v.group_type === 'private' || v.tier !== 'budget'),
        skip_line_access: v.skip_line_access ?? (v.tier === 'luxury'),
        vip_treatment: v.vip_treatment ?? (v.tier === 'luxury'),
        flexible_itinerary: v.flexible_itinerary ?? (v.tier !== 'budget'),
        typical_start_time: v.typical_start_time || null,
        typical_end_time: v.typical_end_time || null,
        pickup_time_range: v.pickup_time_range || null,
        is_active: v.is_active !== false,
        available_seasons: v.available_seasons || []
      }
    })

    const { data, error } = await supabase
      .from('tour_variations')
      .insert(variationsToInsert)
      .select()

    if (error) {
      console.error('Error creating variations:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create variations: ' + error.message },
        { status: 500 }
      )
    }

    // Return appropriate response based on single vs batch
    if (!Array.isArray(body) && data && data.length === 1) {
      // Single variation - match original response format
      return NextResponse.json({
        success: true,
        data: data[0],
        message: 'Variation created successfully'
      }, { status: 201 })
    }

    // Batch creation response
    return NextResponse.json({
      success: true,
      data: data,
      message: `${data?.length || 0} variation(s) created successfully`
    }, { status: 201 })

  } catch (error) {
    console.error('Error in variations POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ============================================
// SMART DEFAULT HELPERS
// ============================================

function getDefaultGroupType(tier: string): 'private' | 'shared' {
  return tier === 'budget' ? 'shared' : 'private'
}

function getDefaultMinPax(tier: string): number {
  return 1
}

function getDefaultMaxPax(tier: string): number {
  switch (tier) {
    case 'luxury': return 6
    case 'standard': return 10
    default: return 15
  }
}

function getDefaultInclusions(tier: string): string[] {
  const base = [
    'Pick-up and drop-off from hotel',
    'Professional Egyptologist guide',
    'All entrance fees as per itinerary',
    'Bottled water during tour'
  ]
  
  if (tier === 'standard') {
    return [
      ...base,
      'Lunch at local restaurant',
      'Air-conditioned vehicle'
    ]
  }
  
  if (tier === 'luxury') {
    return [
      ...base,
      'Gourmet lunch at premium restaurant',
      'Luxury air-conditioned vehicle',
      'Skip-the-line access',
      'Cold towels and refreshments',
      'Gratuities included'
    ]
  }
  
  // Budget
  return base
}

function getDefaultExclusions(): string[] {
  return [
    'International flights',
    'Travel insurance',
    'Personal expenses',
    'Optional activities not mentioned',
    'Camera fees inside sites (where applicable)'
  ]
}

function getDefaultVehicle(tier: string): string {
  switch (tier) {
    case 'luxury': return 'luxury_suv'
    case 'standard': return 'modern_van'
    default: return 'standard_van'
  }
}

function getDefaultAccommodation(tier: string): string {
  switch (tier) {
    case 'luxury': return '5_star'
    case 'standard': return '4_star'
    default: return '3_star'
  }
}

function getDefaultMealQuality(tier: string): string {
  switch (tier) {
    case 'luxury': return 'gourmet'
    case 'standard': return 'good'
    default: return 'basic'
  }
}