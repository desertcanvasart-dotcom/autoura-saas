// app/api/payments/route.ts
// ============================================
// AUTOURA - PAYMENTS API
// ============================================
// Manages payment records
// Multi-tenancy: Enforces tenant isolation via RLS
// Security: Requires authentication for all operations
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { parsePaymentInput } from '@/lib/payment-input'
import { createAuthenticatedClient, requireAuth } from '@/lib/supabase-server'

/**
 * GET /api/payments
 * List payments for authenticated user's tenant
 * RLS policies automatically filter by tenant_id
 */
export async function GET(request: NextRequest) {
  try {
    // Use authenticated client - RLS automatically filters by tenant
    const supabase = await createAuthenticatedClient()

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { data: payments, error } = await supabase
      .from('payments')
      .select(`
        *,
        itineraries (
          itinerary_code,
          client_name,
          client_phone,
          client_email,
          total_cost
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    const formattedPayments = payments?.map((p: any) => ({
      ...p,
      itinerary_code: p.itineraries?.itinerary_code,
      client_name: p.itineraries?.client_name,
      client_phone: p.itineraries?.client_phone,
      client_email: p.itineraries?.client_email,
      total_cost: p.itineraries?.total_cost
    }))

    return NextResponse.json({
      success: true,
      data: formattedPayments || []
    })
  } catch (error: any) {
    console.error('❌ GET /api/payments error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/payments
 * Create a new payment record
 * Requires authentication and validates tenant ownership
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



    // Allowlist + validate. Replaces a spread of the raw body, which both let
    // a client set any column AND made the insert fail outright on any field
    // that is not one (that is how payment_status kept this broken).
    const parsed = parsePaymentInput(body)
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.errors[0].message, errors: parsed.errors },
        { status: 400 }
      )
    }

    // If itinerary_id provided, verify it belongs to this tenant
    if (parsed.value.itinerary_id) {
      const { data: itinerary, error: itineraryError } = await supabase
        .from('itineraries')
        .select('id, tenant_id')
        .eq('id', parsed.value.itinerary_id)
        .single()

      if (itineraryError || !itinerary) {
        return NextResponse.json(
          { success: false, error: 'Itinerary not found or access denied' },
          { status: 404 }
        )
      }

      if (itinerary.tenant_id !== tenant_id) {
        return NextResponse.json(
          { success: false, error: 'Cannot create payment for itinerary from another tenant' },
          { status: 403 }
        )
      }
    }

    // tenant_id last is deliberate: it cannot be overridden by the payload,
    // because the payload no longer contains anything but the allowlist.
    const { data, error } = await supabase
      .from('payments')
      .insert([{ ...parsed.value, tenant_id }])
      .select()
      .single()

    if (error) {
      console.error('❌ Supabase insert error:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('❌ POST /api/payments error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
