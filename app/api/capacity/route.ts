import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { buildCapacityWrite, groupByColumns, type CapacityFields } from '@/lib/capacity/capacity-write'
import { gateRole } from '@/lib/api-role-gate'

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
    if (authResult.error !== null) {
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
    const roleGate = await gateRole('admin')
    if (roleGate) return roleGate
    const authResult = await requireAuth()
    if (authResult.error !== null) {
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

    // Validate and prepare entries. Only the columns each entry carries are
    // written: a save that left out booked counts or notes used to reset them
    // to 0 / blank (documents audit, round 12).
    const preparedEntries: (CapacityFields & { tenant_id: string; date: string; created_by?: string })[] = []
    for (const entry of entries as Record<string, unknown>[]) {
      if (!entry || typeof entry !== 'object' || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        return NextResponse.json(
          { success: false, error: 'Each entry must have a date (YYYY-MM-DD)' },
          { status: 400 }
        )
      }
      const write = buildCapacityWrite(entry)
      if (!write.ok) {
        return NextResponse.json(
          { success: false, error: `${entry.date}: ${write.error}` },
          { status: 400 }
        )
      }
      preparedEntries.push({
        ...write.fields,
        tenant_id,
        date: entry.date,
        created_by: user?.id
      })
    }

    // Upsert entries (update if date exists, insert if not). Batched by column
    // set: a bulk upsert sends the union of keys and fills a row's missing ones,
    // which would reset the columns that row left out.
    const data: unknown[] = []
    let error: { message: string } | null = null
    for (const batch of groupByColumns(preparedEntries)) {
      const res = await supabase
        .from('operator_capacity')
        .upsert(batch, {
          onConflict: 'tenant_id,date',
          ignoreDuplicates: false
        })
        .select()
      if (res.error) {
        error = res.error
        break
      }
      data.push(...(res.data || []))
    }

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
    const roleGate = await gateRole('admin')
    if (roleGate) return roleGate
    const authResult = await requireAuth()
    if (authResult.error !== null) {
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
