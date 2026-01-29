import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// ============================================
// TOUR DEPARTURES API
// File: app/api/departures/route.ts
//
// List and create tour departures
// ============================================

export interface TourDeparture {
  id: string
  tenant_id: string
  template_id: string | null
  variation_id: string | null
  tour_name: string
  tour_code: string | null
  duration_days: number
  start_date: string
  end_date: string
  max_pax: number
  booked_pax: number
  min_pax: number
  status: 'draft' | 'open' | 'limited' | 'full' | 'guaranteed' | 'cancelled'
  cutoff_days: number
  is_guaranteed: boolean
  price_per_person: number | null
  currency: string
  public_notes: string | null
  internal_notes: string | null
  created_at: string
  updated_at: string
  // Joined data
  tour_template?: {
    id: string
    template_name: string
    template_code: string
    duration_days: number
  }
}

/**
 * GET /api/departures
 * List tour departures with optional filters
 *
 * Query params:
 * - status: filter by status
 * - template_id: filter by tour template
 * - start_date: filter departures starting on or after this date
 * - end_date: filter departures starting on or before this date
 * - upcoming: if "true", only show future departures
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const templateId = searchParams.get('template_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const upcoming = searchParams.get('upcoming')

    let query = supabase
      .from('tour_departures')
      .select(`
        *,
        tour_template:tour_templates(id, template_name, template_code, duration_days)
      `)
      .eq('tenant_id', tenant_id)
      .order('start_date', { ascending: true })

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }

    if (templateId) {
      query = query.eq('template_id', templateId)
    }

    if (startDate) {
      query = query.gte('start_date', startDate)
    }

    if (endDate) {
      query = query.lte('start_date', endDate)
    }

    if (upcoming === 'true') {
      const today = new Date().toISOString().split('T')[0]
      query = query.gte('start_date', today)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching departures:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error: unknown) {
    console.error('Departures GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/departures
 * Create a new tour departure
 *
 * Body:
 * - template_id: UUID (optional, link to tour template)
 * - tour_name: string (required if no template_id)
 * - start_date: YYYY-MM-DD (required)
 * - duration_days: number (required if no template_id)
 * - max_pax: number
 * - min_pax: number
 * - status: string
 * - price_per_person: number
 * - etc.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase, tenant_id, user } = authResult
    if (!supabase || !tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const {
      template_id,
      variation_id,
      tour_name,
      tour_code,
      duration_days,
      start_date,
      max_pax = 20,
      min_pax = 2,
      status = 'open',
      cutoff_days = 3,
      is_guaranteed = false,
      price_per_person,
      currency = 'EUR',
      public_notes,
      internal_notes
    } = body

    // Validate required fields
    if (!start_date) {
      return NextResponse.json(
        { success: false, error: 'start_date is required' },
        { status: 400 }
      )
    }

    // If template_id provided, fetch template details
    let finalTourName = tour_name
    let finalTourCode = tour_code
    let finalDurationDays = duration_days

    if (template_id) {
      const { data: template, error: templateError } = await supabase
        .from('tour_templates')
        .select('template_name, template_code, duration_days')
        .eq('id', template_id)
        .single()

      if (templateError || !template) {
        return NextResponse.json(
          { success: false, error: 'Tour template not found' },
          { status: 404 }
        )
      }

      finalTourName = finalTourName || template.template_name
      finalTourCode = finalTourCode || template.template_code
      finalDurationDays = finalDurationDays || template.duration_days
    }

    if (!finalTourName) {
      return NextResponse.json(
        { success: false, error: 'tour_name is required (or provide template_id)' },
        { status: 400 }
      )
    }

    if (!finalDurationDays || finalDurationDays < 1) {
      return NextResponse.json(
        { success: false, error: 'duration_days is required (or provide template_id)' },
        { status: 400 }
      )
    }

    // Calculate end_date
    const startDateObj = new Date(start_date)
    const endDateObj = new Date(startDateObj)
    endDateObj.setDate(endDateObj.getDate() + finalDurationDays - 1)
    const end_date = endDateObj.toISOString().split('T')[0]

    // Validate status
    const validStatuses = ['draft', 'open', 'limited', 'full', 'guaranteed', 'cancelled']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Create the departure
    const departureData = {
      tenant_id,
      template_id: template_id || null,
      variation_id: variation_id || null,
      tour_name: finalTourName,
      tour_code: finalTourCode,
      duration_days: finalDurationDays,
      start_date,
      end_date,
      max_pax,
      min_pax,
      booked_pax: 0,
      status,
      cutoff_days,
      is_guaranteed,
      price_per_person: price_per_person || null,
      currency,
      public_notes: public_notes || null,
      internal_notes: internal_notes || null,
      created_by: user?.id
    }

    const { data, error } = await supabase
      .from('tour_departures')
      .insert(departureData)
      .select(`
        *,
        tour_template:tour_templates(id, template_name, template_code, duration_days)
      `)
      .single()

    if (error) {
      console.error('Error creating departure:', error)

      // Check for unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'A departure for this tour on this date already exists' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Tour departure created successfully'
    })
  } catch (error: unknown) {
    console.error('Departures POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
