// ============================================
// API: SEND QUOTE VIA WHATSAPP
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createClient } from '@/app/supabase'

export async function POST(request: NextRequest) {
  try {
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

    const supabase = createClient()
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

    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    const businessEmail = process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'
    const businessWebsite = process.env.BUSINESS_WEBSITE || 'travel2egypt.org'

    // Format dates
    const startDate = new Date(itinerary.start_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    })
    const endDate = new Date(itinerary.end_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    })

    // Build message
    const message = `🌟 *${businessName}* 🌟\n\n` +
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
      `📧 ${businessEmail}\n` +
      `🌐 ${businessWebsite}\n\n` +
      `We look forward to creating unforgettable memories with you! 🐪✨\n\n` +
      `Best regards,\n${businessName} Team`

    console.log('📤 Sending quote via WhatsApp:', {
      to: clientPhone,
      itineraryId,
      tourName: itinerary.trip_name
    })

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

    console.log('✅ Quote sent successfully via WhatsApp:', result.messageId)

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