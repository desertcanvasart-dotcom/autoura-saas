import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

// ============================================
// CAPACITY CHECK API (Public for AI Agent)
// File: app/api/capacity/check/route.ts
//
// Check availability for a date range
// Used by WhatsApp AI agent for availability responses
// ============================================

interface CapacityCheckResult {
  available: boolean
  status: 'available' | 'limited' | 'busy' | 'blackout' | 'unknown'
  message: string
  details?: {
    date: string
    status: string
    available_slots: number
  }[]
}

/**
 * POST /api/capacity/check
 * Check availability for dates (used by AI agent)
 *
 * Body:
 * - tenant_id: string (required)
 * - start_date: YYYY-MM-DD (required)
 * - end_date: YYYY-MM-DD (optional, defaults to start_date)
 * - group_size: number (optional, for group capacity checking)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tenant_id, start_date, end_date, group_size = 1 } = body

    if (!tenant_id) {
      return NextResponse.json(
        { success: false, error: 'tenant_id is required' },
        { status: 400 }
      )
    }

    if (!start_date) {
      return NextResponse.json(
        { success: false, error: 'start_date is required' },
        { status: 400 }
      )
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return NextResponse.json(
        { success: false, error: 'Invalid start_date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    const effectiveEndDate = end_date || start_date

    // Use admin client since this is called by AI agent without user auth
    const supabase = createAdminClient()

    // Get capacity entries for the date range
    const { data: capacityData, error } = await supabase
      .from('operator_capacity')
      .select('date, status, max_groups, booked_groups, notes, reason')
      .eq('tenant_id', tenant_id)
      .gte('date', start_date)
      .lte('date', effectiveEndDate)
      .order('date', { ascending: true })

    if (error) {
      console.error('Error checking capacity:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    // Create a map of dates to capacity
    const capacityMap = new Map<string, {
      status: string
      max_groups: number
      booked_groups: number
      notes?: string
      reason?: string
    }>()

    capacityData?.forEach(entry => {
      capacityMap.set(entry.date, {
        status: entry.status,
        max_groups: entry.max_groups,
        booked_groups: entry.booked_groups,
        notes: entry.notes,
        reason: entry.reason
      })
    })

    // Generate all dates in range
    const dates: string[] = []
    const current = new Date(start_date)
    const end = new Date(effectiveEndDate)

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0])
      current.setDate(current.getDate() + 1)
    }

    // Check availability for each date
    const details = dates.map(date => {
      const capacity = capacityMap.get(date)

      if (!capacity) {
        // No entry = default available
        return {
          date,
          status: 'available' as const,
          available_slots: 3 - group_size // Default 3 max groups
        }
      }

      const availableSlots = capacity.max_groups - capacity.booked_groups

      return {
        date,
        status: capacity.status as 'available' | 'limited' | 'busy' | 'blackout',
        available_slots: availableSlots,
        reason: capacity.reason
      }
    })

    // Determine overall availability
    const hasBlackout = details.some(d => d.status === 'blackout')
    const hasBusy = details.some(d => d.status === 'busy' && d.available_slots < group_size)
    const hasLimited = details.some(d => d.status === 'limited')
    const allAvailable = details.every(d =>
      d.status === 'available' || (d.available_slots >= group_size)
    )

    let result: CapacityCheckResult

    if (hasBlackout) {
      const blackoutDates = details.filter(d => d.status === 'blackout')
      const reasons = blackoutDates.map(d => d.reason).filter(Boolean)
      result = {
        available: false,
        status: 'blackout',
        message: `We're not operating on ${blackoutDates.length > 1 ? 'some of those dates' : blackoutDates[0].date}${reasons.length > 0 ? ` (${reasons[0]})` : ''}. Would you like to check alternative dates?`,
        details
      }
    } else if (hasBusy) {
      const busyDates = details.filter(d => d.status === 'busy' && d.available_slots < group_size)
      result = {
        available: false,
        status: 'busy',
        message: `We're fully booked on ${busyDates.length > 1 ? 'some dates in that range' : busyDates[0].date}. Would you like me to suggest alternative dates?`,
        details
      }
    } else if (hasLimited) {
      result = {
        available: true,
        status: 'limited',
        message: 'Those dates work for us, though we have limited availability. I recommend booking soon to secure your spot. We\'ll confirm hotel and service availability once you proceed.',
        details
      }
    } else if (allAvailable) {
      result = {
        available: true,
        status: 'available',
        message: 'Great news! Those dates work on our end. We\'ll confirm hotel availability and finalize the booking details once you\'re ready to proceed.',
        details
      }
    } else {
      result = {
        available: true,
        status: 'unknown',
        message: 'Let me check those dates and get back to you with confirmation.',
        details
      }
    }

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error: unknown) {
    console.error('Capacity check error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
