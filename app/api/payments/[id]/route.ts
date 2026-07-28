// app/api/payments/[id]/route.ts
// ============================================
// AUTOURA - SINGLE PAYMENT API
// ============================================
// Get/Update/Delete individual payment
// Multi-tenancy: RLS enforces tenant isolation
// Security: Requires authentication
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { parsePaymentInput } from '@/lib/payment-input'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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

    const { data: payment, error } = await supabase
      .from('payments')
      .select(`
        *,
        itineraries (
          itinerary_code,
          client_name,
          total_cost
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    const formattedPayment = {
      ...payment,
      itinerary_code: payment.itineraries?.itinerary_code,
      client_name: payment.itineraries?.client_name,
      total_cost: payment.itineraries?.total_cost
    }

    return NextResponse.json({
      success: true,
      data: formattedPayment
    })
  } catch (error: any) {
    console.error('❌ GET payment error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use authenticated client - RLS enforces tenant boundaries
    const supabase = await createAuthenticatedClient()
    const body = await request.json()



    // Same allowlist as POST. `update(body)` had the identical two problems:
    // any column was client-settable, and any field that is not a column made
    // the whole update fail — /payments/[id]/edit sends `...formData`, so
    // editing a payment was broken for exactly the same reason as creating one.
    const parsed = parsePaymentInput(body)
    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.errors[0].message, errors: parsed.errors },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('payments')
      .update({ ...parsed.value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('❌ Supabase update error:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('❌ PUT payment error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Use authenticated client - RLS policies enforce tenant isolation + manager role
    const supabase = await createAuthenticatedClient()

    const { error } = await supabase
      .from('payments')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ Delete error:', error)
      // RLS will return a generic error if permission denied
      if (error.code === 'PGRST116' || error.message.includes('permission')) {
        return NextResponse.json(
          { success: false, error: 'Payment not found or you do not have permission to delete it' },
          { status: 403 }
        )
      }
      throw error
    }

    return NextResponse.json({
      success: true
    })
  } catch (error: any) {
    console.error('❌ DELETE payment error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
