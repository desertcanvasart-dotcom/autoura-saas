// ============================================
// API: SEND QUOTE VIA WHATSAPP
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { loadItineraryCompleteness } from '@/lib/pricing/itinerary-completeness'
import { allowsIncomplete, describeGaps } from '@/lib/pricing/quote-completeness'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { requireAuth } from '@/lib/supabase-server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { effectiveItineraryTotal } from '@/lib/itinerary-client-total'

export async function POST(request: NextRequest) {
  try {
    // Require authentication - sends WhatsApp messages (costs money)
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { supabase } = authResult
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const body = await request.json()

    const { itineraryId } = body

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }
    const { data: itinerary, error: dbError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    if (dbError || !itinerary) {
      console.error('❌ Database error:', dbError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    // Every service must have a price before this reaches a client. A service
    // with no rate and no cost is a gap: filling it in on the itinerary clears
    // it. Fails CLOSED — a database error refuses rather than reading as
    // complete (lib/pricing/itinerary-completeness.ts).
    const itineraryLines = await loadItineraryCompleteness(supabase, itineraryId, authResult.tenant_id)
    if (!itineraryLines.ok) {
      return NextResponse.json(
        { success: false, error: itineraryLines.error },
        { status: itineraryLines.status }
      )
    }
    if (!itineraryLines.completeness.complete && !allowsIncomplete(body?.allow_incomplete)) {
      return NextResponse.json(
        {
          success: false,
          error: `${itineraryLines.completeness.gaps.length} service(s) have no price: ${describeGaps(itineraryLines.completeness.gaps)}. Add the costs on the itinerary, or send it anyway with allow_incomplete=true.`,
          gaps: itineraryLines.completeness.gaps,
        },
        { status: 422 }
      )
    }

    // The recipient is the trip's client, never a number the request names.
    const clientPhone = itinerary.client_phone
    const clientName = itinerary.client_name
    if (!clientPhone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number is required' },
        { status: 400 }
      )
    }

    // The total the itinerary page and the client email show (the services'
    // client prices). The stored total_cost is a cache that is often 0.
    const { data: days, error: daysError } = await supabase
      .from('itinerary_days')
      .select('id')
      .eq('itinerary_id', itinerary.id)
    const dayIds = (days || []).map((d: { id: string }) => d.id)
    const { data: services, error: servicesError } = dayIds.length
      ? await supabase.from('itinerary_services').select('total_cost, client_price').in('itinerary_day_id', dayIds)
      : { data: [], error: null }
    if (daysError || servicesError) {
      return NextResponse.json({ success: false, error: 'Could not read the itinerary services' }, { status: 500 })
    }
    const total = effectiveItineraryTotal(itinerary, services || [])

    // Output gate (harness Layer 2): never send a non-deliverable price.
    const priceCheck = checkAmountDeliverable(total, { currency: itinerary.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Quote price is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    // A null date would render as 1 Jan 1970 in the client message.
    if (!itinerary.start_date || !itinerary.end_date) {
      return NextResponse.json(
        { success: false, error: 'Itinerary is missing start or end date' },
        { status: 422 }
      )
    }

    // Identity comes from the TENANT, not env vars: BUSINESS_NAME was one
    // global value defaulting to Travel2Egypt, so every other tenant's quote
    // messages carried the wrong company. Blank fields are omitted downstream.
    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    const businessName = senderTenant?.company_name || ''
    const businessEmail = senderTenant?.contact_email || ''
    const businessWebsite = senderTenant?.company_website || ''

    // Format dates
    const startDate = new Date(itinerary.start_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    })
    const endDate = new Date(itinerary.end_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    })

    // Build message
    const numChildren = itinerary.num_children ?? 0
    const message = (businessName ? `🌟 *${businessName}* 🌟\n\n` : '') +
      `Dear ${clientName || itinerary.client_name},\n\n` +
      `Thank you for your interest in travelling with us!\n\n` +
      `📋 *Your Tour Quote*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Your tour'}\n` +
      `📅 *Dates:* ${startDate} - ${endDate}\n` +
      `👥 *Travelers:* ${itinerary.num_adults || 1} adult${(itinerary.num_adults || 1) > 1 ? 's' : ''}` +
      `${numChildren > 0 ? `, ${numChildren} child${numChildren > 1 ? 'ren' : ''}` : ''}\n` +
      `💰 *Total Cost:* ${itinerary.currency || 'EUR'} ${total.toFixed(2)}\n\n` +
      // No fixed "What's Included" list: it promised a guide, entrance fees,
      // meals and pickups whatever the trip held.
      `💳 *Ready to Book?*\n` +
      `Reply to this message or contact us:\n` +
      (businessEmail ? `📧 ${businessEmail}\n` : '') +
      (businessWebsite ? `🌐 ${businessWebsite}\n` : '') + '\n' +
      `We look forward to creating unforgettable memories with you! ✨\n\n` +
      `Best regards,\n${businessName ? businessName + ' Team' : 'Your travel team'}`



    // Send message (text only - no PDF attachment)
    const result = await sendWhatsAppMessage({
      to: clientPhone,
      body: message
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Mark the quote sent — only a trip still being quoted. Re-sending the
    // quote for a confirmed (or later) trip moved it back to "sent".
    if (!itinerary.status || itinerary.status === 'draft') {
      const { error: statusError } = await supabase
        .from('itineraries')
        .update({ status: 'sent', updated_at: new Date().toISOString() })
        .eq('id', itineraryId)
        .eq('tenant_id', authResult.tenant_id)
      if (statusError) console.error('send-quote: status not updated:', statusError.message)
    }



    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Quote sent successfully via WhatsApp'
    })

  } catch (error: any) {
    console.error('❌ Error sending quote:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}