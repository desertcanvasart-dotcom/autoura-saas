// app/api/itinerary-resources/route.ts
// ============================================
// AUTOURA - ITINERARY RESOURCES API
// ============================================
// Manages resource assignments to itineraries
// Multi-tenancy: Enforces tenant isolation via RLS
// Security: Requires authentication for all operations
// ============================================

import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/itinerary-resources
 * List resource assignments for authenticated user's tenant
 * RLS policies automatically filter by tenant_id
 *
 * Query params:
 * - itinerary_id: Filter by specific itinerary
 * - resource_type: Filter by resource type (guide, vehicle, hotel, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()
    const { searchParams } = new URL(request.url)

    const itineraryId = searchParams.get('itinerary_id')
    const resourceType = searchParams.get('resource_type')

    let query = supabase
      .from('itinerary_resources')
      .select('*')
      .order('start_date', { ascending: true })

    if (itineraryId) {
      query = query.eq('itinerary_id', itineraryId)
    }

    if (resourceType) {
      query = query.eq('resource_type', resourceType)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error: any) {
    console.error('❌ Error fetching itinerary resources:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch resources' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/itinerary-resources
 * Create a new resource assignment
 * Requires authentication and validates tenant ownership of itinerary
 */
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

    const {
      itinerary_id,
      itinerary_day_id,
      resource_type,
      resource_id,
      resource_name,
      start_date,
      end_date,
      notes,
      quantity,
      cost_eur,
      cost_non_eur,
      status
    } = body

    // Validate required fields
    if (!itinerary_id || !resource_type || !resource_id || !start_date) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: itinerary_id, resource_type, resource_id, start_date' },
        { status: 400 }
      )
    }

    // Verify the itinerary belongs to this tenant
    const { data: itinerary, error: itineraryError } = await supabase
      .from('itineraries')
      .select('id, tenant_id')
      .eq('id', itinerary_id)
      .single()

    if (itineraryError || !itinerary) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found or access denied' },
        { status: 404 }
      )
    }

    if (itinerary.tenant_id !== tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Cannot assign resources to itinerary from another tenant' },
        { status: 403 }
      )
    }

    // Insert with explicit tenant_id
    // Note: The trigger will also auto-populate it, but being explicit is safer
    const { data, error } = await supabase
      .from('itinerary_resources')
      .insert({
        tenant_id, // Explicit tenant_id
        itinerary_id,
        itinerary_day_id: itinerary_day_id || null,
        resource_type,
        resource_id,
        resource_name: resource_name || null,
        start_date,
        end_date: end_date || start_date,
        notes: notes || null,
        quantity: quantity || 1,
        cost_eur: cost_eur || null,
        cost_non_eur: cost_non_eur || null,
        status: status || 'confirmed'
      })
      .select()
      .single()

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('❌ Error creating itinerary resource:', error)

    // Handle unique constraint violation
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'This resource is already assigned for this date' },
        { status: 400 }
      )
    }

    // Handle foreign key violations
    if (error.code === '23503') {
      return NextResponse.json(
        { success: false, error: 'Invalid itinerary_id or resource_id' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create resource assignment' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/itinerary-resources?id=xxx
 * Delete a resource assignment
 * RLS policies ensure user can only delete their tenant's resources
 * Requires manager role or higher
 */
export async function DELETE(request: NextRequest) {
  try {
    // Use authenticated client - RLS policies will enforce tenant isolation
    const supabase = await createAuthenticatedClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Resource ID required' },
        { status: 400 }
      )
    }

    // RLS policy will prevent deletion if not same tenant or insufficient role
    const { error } = await supabase
      .from('itinerary_resources')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ Delete error:', error)
      // RLS will return a generic error, check for permission issues
      if (error.code === 'PGRST116' || error.message.includes('permission')) {
        return NextResponse.json(
          { success: false, error: 'Resource not found or you do not have permission to delete it' },
          { status: 403 }
        )
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('❌ Error deleting itinerary resource:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete resource' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/itinerary-resources?id=<assignment id>
 * Change an assignment's dates — e.g. airport staff booked for the whole trip
 * when they meet the arrival only. Body: { start_date, end_date? }; end
 * defaults to start (one day). RLS scopes the row to the tenant; an update
 * that matches nothing (not found, or not permitted) says so.
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Authentication failed' }, { status: 401 })

    const id = new URL(request.url).searchParams.get('id')
    const body = await request.json().catch(() => ({}))
    const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
    const start = body.start_date
    const end = body.end_date || start
    if (!id) return NextResponse.json({ success: false, error: 'Resource ID required' }, { status: 400 })
    if (!isDay(start) || !isDay(end)) {
      return NextResponse.json({ success: false, error: 'start_date and end_date must be dates (YYYY-MM-DD)' }, { status: 400 })
    }
    if (end < start) return NextResponse.json({ success: false, error: 'The end date is before the start date' }, { status: 400 })

    const { data, error } = await supabase
      .from('itinerary_resources')
      .update({ start_date: start, end_date: end, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, start_date, end_date')
    if (error) throw error
    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: 'Assignment not found, or you do not have permission to change it' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: data[0] })
  } catch (error) {
    console.error('❌ Error updating itinerary resource dates:', error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to update the dates' }, { status: 500 })
  }
}
