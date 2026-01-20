import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - List all tour templates with variations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category_id')
    const tourType = searchParams.get('tour_type')
    const isActive = searchParams.get('is_active')

    // First get templates
    let query = supabaseAdmin
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
        { success: false, error: 'Failed to fetch templates' },
        { status: 500 }
      )
    }

    // Get all variations for these templates
    if (templates && templates.length > 0) {
      const templateIds = templates.map(t => t.id)
      
      const { data: variations, error: variationsError } = await supabaseAdmin
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
      template_code: templateCode,
      template_name: body.template_name,
      category_id: body.category_id || null,
      tour_type: body.tour_type,
      duration_days: body.duration_days || 1,
      duration_nights: body.duration_nights || null,
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

    const { data, error } = await supabaseAdmin
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