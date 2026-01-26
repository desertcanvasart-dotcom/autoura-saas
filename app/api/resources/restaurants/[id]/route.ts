// ============================================
// API Route: /api/resources/restaurants/[id]/route.ts
// ============================================
// Single restaurant operations: GET, PUT, DELETE
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// GET - Get single restaurant
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Use authenticated client - RLS filters by tenant
    const supabase = await createAuthenticatedClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { id } = await params

    // RLS ensures user can only access their tenant's restaurants
    const { data, error } = await supabase
      .from('restaurant_contacts')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data
    })

  } catch (error) {
    console.error('Error in restaurant GET:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT - Update restaurant
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    const { id } = await params
    const body = await request.json()

    const updateData: any = {}

    // Basic fields
    if (body.name !== undefined) updateData.name = body.name
    if (body.restaurant_type !== undefined) updateData.restaurant_type = body.restaurant_type
    if (body.cuisine_type !== undefined) updateData.cuisine_type = body.cuisine_type
    if (body.city !== undefined) updateData.city = body.city
    if (body.address !== undefined) updateData.address = body.address
    if (body.contact_person !== undefined) updateData.contact_person = body.contact_person
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.email !== undefined) updateData.email = body.email
    if (body.whatsapp !== undefined) updateData.whatsapp = body.whatsapp
    if (body.capacity !== undefined) updateData.capacity = body.capacity
    if (body.meal_types !== undefined) updateData.meal_types = body.meal_types
    if (body.dietary_options !== undefined) updateData.dietary_options = body.dietary_options
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.tier !== undefined) updateData.tier = body.tier
    if (body.is_preferred !== undefined) updateData.is_preferred = body.is_preferred

    // Rate fields - EUR
    if (body.rate_per_person_eur !== undefined) updateData.rate_per_person_eur = body.rate_per_person_eur || null
    if (body.rate_breakfast_eur !== undefined) updateData.rate_breakfast_eur = body.rate_breakfast_eur || null
    if (body.rate_lunch_eur !== undefined) updateData.rate_lunch_eur = body.rate_lunch_eur || null
    if (body.rate_dinner_eur !== undefined) updateData.rate_dinner_eur = body.rate_dinner_eur || null

    // Rate fields - Non-EUR
    if (body.rate_per_person_non_eur !== undefined) updateData.rate_per_person_non_eur = body.rate_per_person_non_eur || null
    if (body.rate_breakfast_non_eur !== undefined) updateData.rate_breakfast_non_eur = body.rate_breakfast_non_eur || null
    if (body.rate_lunch_non_eur !== undefined) updateData.rate_lunch_non_eur = body.rate_lunch_non_eur || null
    if (body.rate_dinner_non_eur !== undefined) updateData.rate_dinner_non_eur = body.rate_dinner_non_eur || null

    // Inclusions
    if (body.drinks_included !== undefined) updateData.drinks_included = body.drinks_included
    if (body.tip_included !== undefined) updateData.tip_included = body.tip_included

    // Discounts
    if (body.child_discount_percent !== undefined) updateData.child_discount_percent = body.child_discount_percent
    if (body.group_discount_percent !== undefined) updateData.group_discount_percent = body.group_discount_percent || null
    if (body.group_min_size !== undefined) updateData.group_min_size = body.group_min_size

    // Validity
    if (body.rate_valid_from !== undefined) updateData.rate_valid_from = body.rate_valid_from || null
    if (body.rate_valid_to !== undefined) updateData.rate_valid_to = body.rate_valid_to || null

    // Block tenant_id changes
    delete updateData.tenant_id

    // RLS ensures user can only update their tenant's restaurants
    const { data, error } = await supabase
      .from('restaurant_contacts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating restaurant:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update restaurant' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data,
      message: 'Restaurant updated successfully'
    })

  } catch (error) {
    console.error('Error in restaurant PUT:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete restaurant
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    const { id } = await params

    // Check if restaurant has assigned itineraries (RLS filters by tenant)
    const { data: itineraries, error: checkError } = await supabase
      .from('itineraries')
      .select('id')
      .eq('assigned_restaurant_id', id)
      .limit(1)

    if (checkError) {
      return NextResponse.json(
        { success: false, error: 'Failed to check restaurant assignments' },
        { status: 500 }
      )
    }

    if (itineraries && itineraries.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete restaurant with assigned bookings. Please unassign bookings first or set restaurant to inactive.'
        },
        { status: 409 }
      )
    }

    // RLS ensures user can only delete their tenant's restaurants
    const { error } = await supabase
      .from('restaurant_contacts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting restaurant:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete restaurant' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Restaurant deleted successfully'
    })

  } catch (error) {
    console.error('Error in restaurant DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}