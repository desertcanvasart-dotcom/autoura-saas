import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - List all tour templates with variations
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    let supabase
    try {
      supabase = await createAuthenticatedClient()
    } catch (authError) {
      console.error('Auth error creating client:', authError)
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category_id')
    const tourType = searchParams.get('tour_type')
    const isActive = searchParams.get('is_active')

    // Get templates (RLS filters to tenant's templates only)
    let query = supabase
      .from('tour_templates')
      .select(`
        *,
        category:tour_categories(id, category_name, category_code)
      `)
      .order('template_name', { ascending: true })

    if (category) {
      query = query.eq('category_id', category)
    }

    if (tourType) {
      query = query.eq('tour_type', tourType)
    }

    if (isActive !== null && isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data: templates, error: templatesError } = await query

    if (templatesError) {
      console.error('Error fetching templates:', templatesError)
      return NextResponse.json(
        { success: false, error: `Failed to fetch templates: ${templatesError.message}`, details: templatesError },
        { status: 500 }
      )
    }

    // Get all variations for these templates (RLS filters to tenant's variations only)
    if (templates && templates.length > 0) {
      const templateIds = templates.map(t => t.id)

      const { data: variations, error: variationsError } = await supabase
        .from('tour_variations')
        .select('*')
        .in('template_id', templateIds)
        .order('tier', { ascending: true })

      if (!variationsError && variations) {
        // Attach variations to their templates
        const templatesWithVariations = templates.map(template => ({
          ...template,
          variations: variations.filter(v => v.template_id === template.id)
        }))

        return NextResponse.json({
          success: true,
          data: templatesWithVariations,
          count: templatesWithVariations.length
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: templates || [],
      count: templates?.length || 0
    })

  } catch (error) {
    console.error('Error in templates GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST - Create new tour template
export async function POST(request: NextRequest) {
  try {
    // Require authentication and get tenant info
    const authResult = await requireAuth()
    if (authResult.error !== null) {
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

    if (!body.template_name || !body.tour_type) {
      return NextResponse.json(
        { success: false, error: 'Template name and tour type are required' },
        { status: 400 }
      )
    }

    // Generate template code if not provided
    const templateCode = body.template_code || generateTemplateCode(body)

    const templateData = {
      tenant_id, // ✅ Explicit tenant_id
      template_code: templateCode,
      template_name: body.template_name,
      category_id: body.category_id || null,
      tour_type: body.tour_type,
      duration_days: body.duration_days || 1,
      // `|| null` swallowed the wizard's legitimate 0 (a day tour has zero
      // nights) and the column is NOT NULL — so creating any day-tour
      // template failed with a not-null violation (operator, 1 Sep). `??`
      // keeps 0; absent still defaults sensibly to days − 1.
      duration_nights: body.duration_nights ?? Math.max(0, (body.duration_days || 1) - 1),
      // Day/stopover tours are measured in hours (nullable column); multi-day
      // tours leave this null and use duration_days/nights instead.
      duration_hours: body.duration_hours ?? null,
      primary_destination_id: body.primary_destination_id || null,
      destinations_covered: body.destinations_covered || [],
      cities_covered: body.cities_covered || [],
      short_description: body.short_description || null,
      long_description: body.long_description || null,
      highlights: body.highlights || [],
      main_attractions: body.main_attractions || [],
      best_for: body.best_for || [],
      physical_level: body.physical_level || 'moderate',
      age_suitability: body.age_suitability || 'all_ages',
      pickup_required: body.pickup_required !== false,
      accommodation_nights: body.accommodation_nights || null,
      meals_included: body.meals_included || [],
      image_url: body.image_url || null,
      gallery_urls: body.gallery_urls || [],
      is_featured: body.is_featured || false,
      is_active: body.is_active !== false,
      popularity_score: body.popularity_score || 0,
      default_transportation_service: body.default_transportation_service || 'day_tour',
      transportation_city: body.transportation_city || 'Cairo',
      // NEW FIELDS
      itinerary: body.itinerary || [],
      inclusions: body.inclusions || [],
      exclusions: body.exclusions || []
    }

    // Idempotency guard. The create form double-fires ~1.4s apart in the wild
    // (confirmed in prod: two "Private Memphis, Saqqara, and Dahshur
    // Excursion" templates at 17:26:30 and :32, 1.4s apart). The client-side
    // submit guard did NOT stop it — the two calls are seconds apart, not the
    // same tick — so the server must be the backstop. A template's code is
    // generated per request with no unique constraint, so nothing downstream
    // dedupes it either.
    //
    // Before inserting, look for a template this tenant just created with the
    // same name and type. If found, return THAT one instead of a second row.
    // The window is short so a genuine same-name template made minutes later
    // still creates normally.
    const dupWindowStart = new Date(Date.now() - 15_000).toISOString()
    const { data: recent } = await supabase
      .from('tour_templates')
      // Empty select() returns all columns, like the insert below — and
      // avoids the star form the select-star ratchet counts.
      .select()
      .eq('tenant_id', tenant_id)
      .eq('template_name', body.template_name)
      .eq('tour_type', body.tour_type)
      .gte('created_at', dupWindowStart)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent) {
      // The double-submit's second request: hand back the row the first one
      // created rather than making a twin. The client then links its
      // variations to this same id.
      return NextResponse.json({
        success: true,
        data: recent,
        message: 'Template already created',
        deduplicated: true,
      })
    }

    const { data, error } = await supabase
      .from('tour_templates')
      .insert([templateData])
      .select()
      .single()

    if (error) {
      console.error('Error creating template:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create template' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Template created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Error in templates POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper to generate template code
function generateTemplateCode(data: any): string {
  const city = data.cities_covered?.[0] || 'EGYPT'
  const type = (data.tour_type || 'tour').toUpperCase().replace('_', '-')
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `${city.substring(0, 3).toUpperCase()}-${type.substring(0, 3)}-${random}`
}