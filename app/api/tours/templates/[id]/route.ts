import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - Get single template with variations and days
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    // Get template with category (RLS filters to tenant's templates only)
    const { data: template, error: templateError } = await supabase
      .from('tour_templates')
      .select(`
        *,
        category:tour_categories(id, category_name, category_code)
      `)
      .eq('id', id)
      .single()

    if (templateError) {
      console.error('Error fetching template:', templateError)
      return NextResponse.json(
        { success: false, error: templateError.message },
        { status: 404 }
      )
    }

    if (!template) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      )
    }

    // Get variations (RLS filters to tenant's variations only)
    const { data: variations } = await supabase
      .from('tour_variations')
      .select('*')
      .eq('template_id', id)
      .order('tier', { ascending: true })

    // Get days with activities (RLS filters automatically)
    const { data: days } = await supabase
      .from('tour_days')
      .select(`
        *,
        activities:tour_day_activities(
          *,
          entrance:attractions(id, name, city),
          transportation:transportation_rates(id, vehicle_type, city)
        ),
        accommodation:hotel_contacts(id, name, city),
        lunch_meal:restaurant_contacts!lunch_meal_id(id, name, city),
        dinner_meal:restaurant_contacts!dinner_meal_id(id, name, city),
        guide:guides(id, name, languages)
      `)
      .eq('tour_id', id)
      .order('day_number', { ascending: true })

    // Get pricing (RLS filters to tenant's pricing only)
    const { data: pricing } = await supabase
      .from('tour_pricing')
      .select('*')
      .eq('tour_id', id)
      .order('pax', { ascending: true })

    return NextResponse.json({
      success: true,
      data: {
        ...template,
        variations: variations || [],
        days: days || [],
        pricing: pricing || []
      }
    })

  } catch (error) {
    console.error('Error in template GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update template
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

    const { supabase } = authResult
    const body = await request.json()

    const updateData: any = {}

    // Only update fields that are provided
    if (body.template_code !== undefined) updateData.template_code = body.template_code
    if (body.template_name !== undefined) updateData.template_name = body.template_name
    if (body.category_id !== undefined) updateData.category_id = body.category_id || null
    if (body.tour_type !== undefined) updateData.tour_type = body.tour_type
    if (body.duration_days !== undefined) updateData.duration_days = body.duration_days
    if (body.duration_nights !== undefined) updateData.duration_nights = body.duration_nights
    if (body.primary_destination_id !== undefined) updateData.primary_destination_id = body.primary_destination_id
    if (body.destinations_covered !== undefined) updateData.destinations_covered = body.destinations_covered
    if (body.cities_covered !== undefined) updateData.cities_covered = body.cities_covered
    if (body.short_description !== undefined) updateData.short_description = body.short_description
    if (body.long_description !== undefined) updateData.long_description = body.long_description
    if (body.highlights !== undefined) updateData.highlights = body.highlights
    if (body.main_attractions !== undefined) updateData.main_attractions = body.main_attractions
    if (body.best_for !== undefined) updateData.best_for = body.best_for
    if (body.physical_level !== undefined) updateData.physical_level = body.physical_level
    if (body.age_suitability !== undefined) updateData.age_suitability = body.age_suitability
    if (body.pickup_required !== undefined) updateData.pickup_required = body.pickup_required
    if (body.accommodation_nights !== undefined) updateData.accommodation_nights = body.accommodation_nights
    if (body.meals_included !== undefined) updateData.meals_included = body.meals_included
    if (body.image_url !== undefined) updateData.image_url = body.image_url
    if (body.gallery_urls !== undefined) updateData.gallery_urls = body.gallery_urls
    if (body.is_featured !== undefined) updateData.is_featured = body.is_featured
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.popularity_score !== undefined) updateData.popularity_score = body.popularity_score
    if (body.default_transportation_service !== undefined) updateData.default_transportation_service = body.default_transportation_service
    if (body.transportation_city !== undefined) updateData.transportation_city = body.transportation_city

    // NEW FIELDS
    if (body.itinerary !== undefined) updateData.itinerary = body.itinerary
    if (body.inclusions !== undefined) updateData.inclusions = body.inclusions
    if (body.exclusions !== undefined) updateData.exclusions = body.exclusions

    // Add updated_at
    updateData.updated_at = new Date().toISOString()

    // Do NOT include tenant_id in update (prevents tenant switching)
    delete updateData.tenant_id

    console.log('Updating template:', id, 'with fields:', Object.keys(updateData))

    // Update template (RLS enforces tenant boundaries)
    const { data, error } = await supabase
      .from('tour_templates')
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) {
      console.error('Error updating template:', error)
      return NextResponse.json(
        { success: false, error: error.message || 'Failed to update template' },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Template not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data[0],
      message: 'Template updated successfully'
    })

  } catch (error) {
    console.error('Error in template PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete template (and cascade to variations, days, activities, pricing)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Require authentication - RLS policies enforce manager role
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult

    // Get all days first (RLS filters to tenant's days only)
    const { data: days } = await supabase
      .from('tour_days')
      .select('id')
      .eq('tour_id', id)

    if (days && days.length > 0) {
      const dayIds = days.map(d => d.id)

      // Delete activities for these days (RLS enforced)
      await supabase
        .from('tour_day_activities')
        .delete()
        .in('tour_day_id', dayIds)
    }

    // Delete days (RLS enforced)
    await supabase
      .from('tour_days')
      .delete()
      .eq('tour_id', id)

    // Delete variation services first (RLS filters to tenant's variations only)
    const { data: variations } = await supabase
      .from('tour_variations')
      .select('id')
      .eq('template_id', id)

    if (variations && variations.length > 0) {
      const variationIds = variations.map(v => v.id)
      await supabase
        .from('variation_services')
        .delete()
        .in('variation_id', variationIds)
    }

    // Delete variations (RLS enforced)
    await supabase
      .from('tour_variations')
      .delete()
      .eq('template_id', id)

    // Delete pricing (RLS enforced)
    await supabase
      .from('tour_pricing')
      .delete()
      .eq('tour_id', id)

    // Delete template (RLS requires manager role)
    const { error } = await supabase
      .from('tour_templates')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting template:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete template' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully'
    })

  } catch (error) {
    console.error('Error in template DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}