import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { requireAuth } from '@/lib/supabase-server'

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
    const { itineraryId } = body

    console.log('📤 Send tour reminder request:', { itineraryId })

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    // Get itinerary
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .single()

    if (itinError || !itinerary) {
      console.error('❌ Itinerary error:', itinError)
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

    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    }

    const message = `⏰ *${businessName} - Tour Reminder* ⏰\n\n` +
      `Hi ${itinerary.client_name},\n\n` +
      `Reminder: Your tour is tomorrow! 🌟\n\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Egypt Tour'}\n` +
      `📅 *Date:* ${formatDate(itinerary.start_date)}\n` +
      `🕐 *Pickup Time:* ${itinerary.pickup_time || 'To be confirmed'}\n` +
      `📍 *Pickup Location:* ${itinerary.pickup_location || 'To be confirmed'}\n\n` +
      `✅ Please be ready 10 minutes early\n` +
      `✅ Bring your booking confirmation\n` +
      `✅ Comfortable shoes recommended\n` +
      `✅ Don't forget your camera! 📸\n\n` +
      `Your guide will contact you shortly before pickup.\n\n` +
      `See you soon! 🐪✨\n\n` +
      `${businessName} Team`

    console.log('📤 Sending reminder to:', itinerary.client_phone)

    const result = await sendWhatsAppMessage({
      to: itinerary.client_phone,
      body: message
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log('✅ Tour reminder sent:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Tour reminder sent successfully'
    })

  } catch (error: any) {
    console.error('❌ Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}