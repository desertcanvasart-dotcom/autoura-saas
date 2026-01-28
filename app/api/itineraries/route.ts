import { NextRequest, NextResponse } from 'next/server'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

// Generate unique itinerary code
function generateItineraryCode(): string {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `ITN-${year}-${random}`
}

// Calculate days between two dates
function calculateTotalDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 1
  const start = new Date(startDate)
  const end = new Date(endDate)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays + 1 // Include both start and end day
}

/**
 * GET /api/itineraries
 * List all itineraries for the authenticated user's tenant
 * RLS policies automatically filter by tenant_id
 */
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS will automatically filter by tenant
    const supabase = await createAuthenticatedClient()

    const { data, error } = await supabase
      .from('itineraries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    console.log('✅ Found itineraries:', data?.length || 0)

    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (error: any) {
    console.error('❌ API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/itineraries
 * Create a new itinerary for the authenticated user's tenant
 * RLS policies will validate tenant_id
 */
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
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }
    const body = await request.json()

    // Generate itinerary_code if not provided
    if (!body.itinerary_code) {
      body.itinerary_code = generateItineraryCode()
    }

    // Calculate total_days from dates if not provided
    if (!body.total_days && body.start_date && body.end_date) {
      body.total_days = calculateTotalDays(body.start_date, body.end_date)
    } else if (!body.total_days) {
      body.total_days = 1
    }

    // Set default status if not provided
    if (!body.status) {
      body.status = 'draft'
    }

    // Set default values for other required fields
    body.num_adults = body.num_adults || 1
    body.num_children = body.num_children || 0
    body.total_cost = body.total_cost || 0
    body.currency = body.currency || 'EUR'

    // Set tenant_id and timestamps
    body.tenant_id = tenant_id
    const now = new Date().toISOString()
    body.created_at = body.created_at || now
    body.updated_at = now

    const { data, error } = await supabase
      .from('itineraries')
      .insert([body])
      .select()
      .single()

    if (error) {
      console.error('Error creating itinerary:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}