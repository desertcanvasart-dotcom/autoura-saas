import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { requireAuth } from '@/lib/supabase-server'

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

    if (!itinerary.start_date || !itinerary.end_date) {
      return NextResponse.json(
        { success: false, error: 'Itinerary travel dates not found' },
        { status: 400 }
      )
    }

    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    const businessName = senderTenant?.company_name || ''
    // No review link: there is no per-tenant review URL, and the fallback was
    // another operator's (Travel2Egypt's) Google review page — every tenant's
    // clients were asked to review it. REVIEW_URL is one value for all.

    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    }

    const message = (businessName ? `🎉 *${businessName}* 🎉\n\n` : '') +
      `Dear ${itinerary.client_name},\n\n` +
      `Thank you for traveling with us! 🙏\n\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'your trip'}\n` +
      `📅 *Dates:* ${formatDate(itinerary.start_date)} - ${formatDate(itinerary.end_date)}\n\n` +
      `We hope you had an incredible trip!\n\n` +
      `We'd love to hear your feedback — just reply to this message and tell us about your trip. ⭐\n\n` +
      `Share your photos with us! We'd love to see them. 📸\n\n` +
      `We hope to see you again soon! 🌟\n\n` +
      (businessName ? `Best regards,\n${businessName} Team` : 'Best regards,')



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