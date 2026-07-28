// ============================================
// API: SEND QUOTE VIA WHATSAPP
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { requireAuth } from '@/lib/supabase-server'
import { checkAmountDeliverable } from '@/lib/pricing-guards'

export async function POST(request: NextRequest) {
  try {
    // Require authentication - sends WhatsApp messages (costs money)
    const authResult = await requireAuth()
    if (authResult.error) {
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

    const { itineraryId, clientName, clientPhone } = body

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    if (!clientPhone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number is required' },
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

    // Output gate (harness Layer 2): never send a non-deliverable price.
    const priceCheck = checkAmountDeliverable(itinerary.total_cost, { currency: itinerary.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Quote price is not deliverable', violations: priceCheck.violations },
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
    const message = (businessName ? `🌟 *${businessName}* 🌟\n\n` : '') +
      `Dear ${clientName || itinerary.client_name},\n\n` +
      `Thank you for your interest in exploring Egypt with us! 🇪🇬\n\n` +
      `📋 *Your Tour Quote*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Egypt Tour'}\n` +
      `📅 *Dates:* ${startDate} - ${endDate}\n` +
      `👥 *Travelers:* ${itinerary.num_adults || 1} adult${(itinerary.num_adults || 1) > 1 ? 's' : ''}` +
      `${itinerary.num_children > 0 ? `, ${itinerary.num_children} child${itinerary.num_children > 1 ? 'ren' : ''}` : ''}\n` +
      `💰 *Total Cost:* ${itinerary.currency || 'EUR'} ${(itinerary.total_cost || 0).toFixed(2)}\n\n` +
      `✨ *What's Included:*\n` +
      `✅ Professional tour guide\n` +
      `✅ All entrance fees\n` +
      `✅ Private transportation\n` +
      `✅ Meals as specified\n` +
      `✅ Hotel pickups\n\n` +
      `💳 *Ready to Book?*\n` +
      `Reply to this message or contact us:\n` +
      (businessEmail ? `📧 ${businessEmail}\n` : '') +
      (businessWebsite ? `🌐 ${businessWebsite}\n` : '') + '\n' +
      `We look forward to creating unforgettable memories with you! 🐪✨\n\n` +
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

    // Update itinerary to mark quote as sent
    await supabase
      .from('itineraries')
      .update({
        status: 'sent',
        updated_at: new Date().toISOString()
      })
      .eq('id', itineraryId)



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