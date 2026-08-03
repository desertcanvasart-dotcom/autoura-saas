import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const body = await request.json()
    const { itineraryId, guideId } = body



    if (!itineraryId || !guideId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Get itinerary details (scoped to the session tenant)
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', itineraryId)
      .eq('tenant_id', authResult.tenant_id)
      .single()

    if (itinError || !itinerary) {
      console.error('❌ Itinerary error:', itinError)
      return NextResponse.json(
        { success: false, error: 'Itinerary not found' },
        { status: 404 }
      )
    }

    if (!itinerary.start_date || !itinerary.end_date) {
      return NextResponse.json(
        { success: false, error: 'Itinerary start and end dates are required' },
        { status: 400 }
      )
    }

    // Get guide details from SUPPLIERS table (scoped to the session tenant)
    const { data: guide, error: guideError } = await supabase
      .from('suppliers')
      .select('*')
      .eq('id', guideId)
      .eq('tenant_id', authResult.tenant_id)
      .single()

    if (guideError || !guide) {
      console.error('❌ Guide error:', guideError)
      return NextResponse.json(
        { success: false, error: 'Guide not found' },
        { status: 404 }
      )
    }

    // Use contact_phone or whatsapp field
    const guidePhone = guide.contact_phone || guide.whatsapp || guide.phone2



    if (!guidePhone) {
      return NextResponse.json(
        { success: false, error: 'Guide phone number not found. Please add contact_phone to the supplier.' },
        { status: 400 }
      )
    }

    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    const businessName = senderTenant?.company_name || ''
    const numChildren = itinerary.num_children || 0

    const message = `🎯 *${businessName} - New Assignment* 🎯\n\n` +
      `Hi ${guide.name},\n\n` +
      `You've been assigned to a new tour!\n\n` +
      `📋 *Tour Details:*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🎯 *Tour:* ${itinerary.trip_name || 'Egypt Tour'}\n` +
      `📅 *Start Date:* ${new Date(itinerary.start_date).toLocaleDateString()}\n` +
      `📅 *End Date:* ${new Date(itinerary.end_date).toLocaleDateString()}\n` +
      `👥 *Guests:* ${itinerary.num_adults || 1} adult${(itinerary.num_adults || 1) > 1 ? 's' : ''}` +
      `${numChildren > 0 ? `, ${numChildren} child${numChildren > 1 ? 'ren' : ''}` : ''}\n` +
      `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
      `📞 *Phone:* ${itinerary.client_phone || 'N/A'}\n` +
      `🏨 *Pickup:* ${itinerary.pickup_location || 'To be confirmed'}\n` +
      `🕐 *Time:* ${itinerary.pickup_time || 'To be confirmed'}\n\n` +
      `📝 *Notes:*\n${itinerary.guide_notes || 'None'}\n\n` +
      `Please confirm receipt of this assignment.\n\n` +
      `Good luck! 🌟\n\n` +
      `${businessName} Operations Team`



    const result = await sendWhatsAppMessage({
      to: guidePhone,
      body: message
    })

    if (!result.success) {
      console.error('❌ WhatsApp error:', result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }



    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Guide notified successfully'
    })

  } catch (error: any) {
    console.error('❌ Error notifying guide:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}