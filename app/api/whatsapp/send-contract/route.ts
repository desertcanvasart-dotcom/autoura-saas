import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createClient } from '@/app/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { itineraryId, contractPdfUrl } = body

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Get itinerary details
    const { data: itinerary, error: dbError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    if (dbError || !itinerary) {
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    if (!itinerary.client_phone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number not found' },
        { status: 400 }
      )
    }

    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    
    const message = `📄 *${businessName}* 📄\n\n` +
      `Dear ${itinerary.client_name || 'Valued Guest'},\n\n` +
      `Your tour contract is ready! 🎉\n\n` +
      `📋 *Contract Details:*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Egypt Tour'}\n` +
      `📅 *Dates:* ${new Date(itinerary.start_date).toLocaleDateString()} - ${new Date(itinerary.end_date).toLocaleDateString()}\n` +
      `👥 *Travelers:* ${itinerary.num_adults} adult${itinerary.num_adults > 1 ? 's' : ''}` +
      `${itinerary.num_children > 0 ? `, ${itinerary.num_children} child${itinerary.num_children > 1 ? 'ren' : ''}` : ''}\n` +
      `💰 *Total:* ${itinerary.currency} ${itinerary.total_cost.toFixed(2)}\n\n` +
      `📄 Please review the attached contract carefully.\n\n` +
      `✍️ *Next Steps:*\n` +
      `1. Review all terms and conditions\n` +
      `2. Sign the contract\n` +
      `3. Return signed copy to us\n` +
      `4. Complete payment\n\n` +
      `If you have any questions, please don't hesitate to reach out!\n\n` +
      `📧 ${process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'}\n` +
      `🌐 ${process.env.BUSINESS_WEBSITE || 'travel2egypt.org'}\n\n` +
      `Looking forward to your adventure! 🐪✨\n\n` +
      `Best regards,\n${businessName} Team`

    // Send via WhatsApp with PDF attachment
    const result = await sendWhatsAppMessage({
      to: itinerary.client_phone,
      body: message
      // No mediaUrl - send text only for now
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log('✅ Contract sent:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Contract sent successfully via WhatsApp'
    })

  } catch (error: any) {
    console.error('❌ Error sending contract:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
