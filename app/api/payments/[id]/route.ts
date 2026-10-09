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
import { paymentCurrencyFor } from '@/lib/payment-currency'
import { tripServices } from '@/lib/itineraries/trip-services'
import { effectiveItineraryTotal, type PricedService } from '@/lib/itinerary-client-total'

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
          client_phone,
          client_email,
          total_cost,
          margin_percent
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    // The trip's client total from its services, as every other document
    // shows it — the stored total_cost can be 0 or stale, and the payment
    // invoice prints "Full trip cost / Balance" from it.
    let tripTotal = payment.itineraries?.total_cost ?? null
    if (payment.itinerary_id && payment.itineraries) {
      const services = await tripServices<PricedService>(supabase, payment.itinerary_id, 'total_cost, client_price')
      if (services.ok) tripTotal = effectiveItineraryTotal(payment.itineraries, services.rows)
    }

    const formattedPayment = {
      ...payment,
      // The column is `status`; the payment, invoice and receipt pages and
      // the edit form all read `payment_status` (parsePaymentInput accepts
      // either on the way in). Without it they crashed on .replace().
      payment_status: payment.status,
      itinerary_code: payment.itineraries?.itinerary_code,
      client_name: payment.itineraries?.client_name,
      // The receipt's WhatsApp button and the email on both PDFs need these.
      client_phone: payment.itineraries?.client_phone,
      client_email: payment.itineraries?.client_email,
      total_cost: tripTotal
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

    // As POST: the trip must be this tenant's, and the payment in its currency.
    if (parsed.value.itinerary_id) {
      const { data: itinerary } = await supabase
        .from('itineraries')
        .select('id, currency')
        .eq('id', parsed.value.itinerary_id) // RLS: this tenant's trips only
        .maybeSingle()
      if (!itinerary) {
        return NextResponse.json({ success: false, error: 'Itinerary not found or access denied' }, { status: 404 })
      }
      const paid = paymentCurrencyFor(body.currency, itinerary.currency)
      if (!paid.ok) return NextResponse.json({ success: false, error: paid.error }, { status: 400 })
      parsed.value.currency = paid.currency
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
