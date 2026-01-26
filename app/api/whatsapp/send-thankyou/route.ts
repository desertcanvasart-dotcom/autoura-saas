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

    const body = await request.json()
    const { itineraryId } = body

    console.log('📤 Send thank you request:', { itineraryId })

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
    const reviewUrl = process.env.REVIEW_URL || 'https://g.page/r/travel2egypt/review'

    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    }

    const message = `🎉 *${businessName}* 🎉\n\n` +
      `Dear ${itinerary.client_name},\n\n` +
      `Thank you for traveling with us! 🙏\n\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Egypt Tour'}\n` +
      `📅 *Dates:* ${formatDate(itinerary.start_date)} - ${formatDate(itinerary.end_date)}\n\n` +
      `We hope you had an incredible experience exploring Egypt! 🇪🇬\n\n` +
      `We'd love to hear your feedback. If you enjoyed your tour, please consider leaving us a review:\n` +
      `⭐ ${reviewUrl}\n\n` +
      `Share your photos with us! We love seeing Egypt through your eyes. 📸\n\n` +
      `We hope to see you again soon! 🌟\n\n` +
      `Best regards,\n${businessName} Team`

    console.log('📤 Sending thank you to:', itinerary.client_phone)

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

    // Update itinerary status to completed
    await supabase
      .from('itineraries')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', itineraryId)

    console.log('✅ Thank you message sent:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Thank you message sent successfully'
    })

  } catch (error: any) {
    console.error('❌ Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}