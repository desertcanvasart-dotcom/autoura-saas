import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'

// ============================================
// OPERATOR CAPACITY API
// File: app/api/capacity/route.ts
//
// Endpoints for managing operator capacity
// Used by calendar UI and WhatsApp AI agent
// ============================================

export interface CapacityEntry {
  id: string
  tenant_id: string
  date: string
  status: 'available' | 'limited' | 'busy' | 'blackout'
  max_groups: number
  booked_groups: number
  max_guides?: number
  booked_guides?: number
  max_vehicles?: number
  booked_vehicles?: number
  notes?: string
  internal_notes?: string
  reason?: string
  created_at: string
  updated_at: string
}

/**
 * GET /api/capacity
 * List capacity entries for a date range
 *
 * Query params:
 * - start_date: YYYY-MM-DD (required)
 * - end_date: YYYY-MM-DD (required)
 * - status: filter by status (optional)
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
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const status = searchParams.get('status')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'start_date and end_date are required' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('operator_capacity')
      .select('*')
      .eq('tenant_id', tenant_id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching capacity:', error)
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
    console.error('Capacity GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/capacity
 * Create or update capacity entries
 * Supports bulk upsert for calendar updates
 *
 * Body:
 * - entries: Array of { date, status, max_groups?, notes?, reason? }
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
    const { entries } = body

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'entries array is required' },
        { status: 400 }
      )
    }

    // Validate and prepare entries
    const validStatuses = ['available', 'limited', 'busy', 'blackout']
    const preparedEntries = entries.map((entry: Partial<CapacityEntry>) => {
      if (!entry.date) {
        throw new Error('Each entry must have a date')
      }
      if (entry.status && !validStatuses.includes(entry.status)) {
        throw new Error(`Invalid status: ${entry.status}`)
      }

      return {
        tenant_id,
        date: entry.date,
        status: entry.status || 'available',
        max_groups: entry.max_groups ?? 3,
        booked_groups: entry.booked_groups ?? 0,
        max_guides: entry.max_guides,
        booked_guides: entry.booked_guides ?? 0,
        max_vehicles: entry.max_vehicles,
        booked_vehicles: entry.booked_vehicles ?? 0,
        notes: entry.notes,
        internal_notes: entry.internal_notes,
        reason: entry.reason,
        created_by: user?.id
      }
    })

    // Upsert entries (update if date exists, insert if not)
    const { data, error } = await supabase
      .from('operator_capacity')
      .upsert(preparedEntries, {
        onConflict: 'tenant_id,date',
        ignoreDuplicates: false
      })
      .select()

    if (error) {
      console.error('Error saving capacity:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      message: `${preparedEntries.length} capacity entries saved`
    })
  } catch (error: unknown) {
    console.error('Capacity POST error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/capacity
 * Delete capacity entries for a date range
 * Useful for resetting to default (available)
 *
 * Query params:
 * - start_date: YYYY-MM-DD (required)
 * - end_date: YYYY-MM-DD (required)
 */
export async function DELETE(request: NextRequest) {
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
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'start_date and end_date are required' },
        { status: 400 }
      )
    }

    const { error, count } = await supabase
      .from('operator_capacity')
      .delete()
      .eq('tenant_id', tenant_id)
      .gte('date', startDate)
      .lte('date', endDate)

    if (error) {
      console.error('Error deleting capacity:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${count || 0} capacity entries`
    })
  } catch (error: unknown) {
    console.error('Capacity DELETE error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
