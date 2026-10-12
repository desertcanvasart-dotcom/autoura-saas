import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { capacityDateRange } from '@/lib/capacity/capacity-write'
import { loadDayLoads } from '@/lib/capacity/booking-capacity'

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
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const body = await request.json()
    const { start_date, end_date, group_size = 1 } = body

    // Tenant is derived from the authenticated session, never from the request body
    const tenant_id = authResult.tenant_id

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveEndDate)) {
      return NextResponse.json(
        { success: false, error: 'Invalid end_date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Admin client (bypasses RLS); all queries are scoped to the session tenant below
    const supabase = createAdminClient()

    // Each day's load the way bookings are checked (lib/capacity/booking-capacity):
    // live bookings on the ground + groups booked outside Autoura, against the
    // day's own limit or the company's default (none = no limit).
    if (!capacityDateRange(start_date, effectiveEndDate)) {
      return NextResponse.json(
        { success: false, error: 'Date range is too long (max 366 days)' },
        { status: 400 }
      )
    }
    const { loads, error } = await loadDayLoads(supabase, tenant_id!, start_date, effectiveEndDate)
    if (error) {
      console.error('Error checking capacity:', error)
      return NextResponse.json({ success: false, error }, { status: 500 })
    }

    const details = loads.map(d => {
      const free = d.max == null ? Number.MAX_SAFE_INTEGER : Math.max(0, d.max - d.booked)
      // A day at its limit reads as busy whatever its label says.
      const status = d.status === 'blackout' ? 'blackout' as const
        : d.max != null && free === 0 ? 'busy' as const
        : (d.status as 'available' | 'limited' | 'busy')
      return {
        date: d.date,
        status,
        available_slots: d.max == null ? 99 : free,
        reason: d.reason,
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
