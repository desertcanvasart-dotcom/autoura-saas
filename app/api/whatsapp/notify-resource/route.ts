import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { findRecipient } from '@/lib/notify/find-recipient'

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
    const { itineraryId, resourceId, resourceType, resourceName, startDate, endDate, notes } = body



    if (!itineraryId || !resourceId || !resourceType) {
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

    // Find the person in the table their type actually lives in (scoped to
    // the session tenant). This read only `suppliers` until 2026-10-06, so
    // every airport-staff, hotel-staff and directory-restaurant notify
    // answered "Resource not found": those ids are not supplier ids.
    const resource = await findRecipient(supabase, authResult.tenant_id, resourceType, resourceId)

    if (!resource) {
      return NextResponse.json(
        { success: false, error: `${resourceName || 'This person'} is not in your records, so there is no number to message. Use the staff link instead.` },
        { status: 404 }
      )
    }

    const resourcePhone = resource.phone

    if (!resourcePhone) {
      return NextResponse.json(
        { success: false, error: `No phone number found for ${resource.name || resourceName}. Add one to their record first.` },
        { status: 400 }
      )
    }

    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    const businessName = senderTenant?.company_name || ''
    // With no company name set: "*Reservation Request*" and "Operations",
    // never "* - Reservation Request*" and " Operations".
    const titled = (title: string) => (businessName ? `${businessName} - ${title}` : title)
    const signed = (team: string) => (businessName ? `${businessName} ${team}` : team)

    // Format dates
    const formatDate = (dateStr: string) => {
      return new Date(dateStr).toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      })
    }

    // Guest count string
    const numChildren = itinerary.num_children ?? 0
    const guestCount = `${itinerary.num_adults || 1} adult${(itinerary.num_adults || 1) > 1 ? 's' : ''}` +
      `${numChildren > 0 ? `, ${numChildren} child${numChildren > 1 ? 'ren' : ''}` : ''}`

    // Generate message based on resource type
    let message = ''

    if (resourceType === 'restaurant') {
      message = `🍽️ *${titled('Reservation Request')}*\n\n` +
        `Hello ${resource.name || resourceName || "there"},\n\n` +
        `We would like to make a reservation:\n\n` +
        `📅 *Date:* ${formatDate(startDate)}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `👤 *Client Name:* ${itinerary.client_name || 'N/A'}\n` +
        `${notes ? `📝 *Special Requests:* ${notes}\n` : ''}\n` +
        `Please confirm availability.\n\n` +
        `Thank you!\n` +
        signed('Team')

    } else if (resourceType === 'airport_staff') {
      message = `✈️ *${titled('Airport Assignment')}*\n\n` +
        `Hello ${resource.name || resourceName || "there"},\n\n` +
        `You have been assigned to airport duty:\n\n` +
        `📅 *Date:* ${formatDate(startDate)}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `📞 *Client Phone:* ${itinerary.client_phone || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${itinerary.pickup_location ? `📍 *Location:* ${itinerary.pickup_location}\n` : ''}` +
        `${itinerary.pickup_time ? `🕐 *Time:* ${itinerary.pickup_time}\n` : ''}` +
        `${notes ? `📝 *Notes:* ${notes}\n` : ''}\n` +
        `Please confirm receipt of this assignment.\n\n` +
        signed('Operations')

    } else if (resourceType === 'hotel_staff') {
      message = `🏨 *${titled('Hotel Assignment')}*\n\n` +
        `Hello ${resource.name || resourceName || "there"},\n\n` +
        `You have been assigned to hotel duty:\n\n` +
        `📅 *Dates:* ${formatDate(startDate)}` +
        `${endDate && endDate !== startDate ? ` - ${formatDate(endDate)}` : ''}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `📞 *Client Phone:* ${itinerary.client_phone || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${notes ? `📝 *Notes:* ${notes}\n` : ''}\n` +
        `Please confirm receipt of this assignment.\n\n` +
        signed('Operations')
    } else {
      // Generic message for other resource types
      message = `📋 *${titled('Assignment')}*\n\n` +
        `Hello ${resource.name || resourceName || "there"},\n\n` +
        `You have been assigned:\n\n` +
        `📅 *Date:* ${formatDate(startDate)}` +
        `${endDate && endDate !== startDate ? ` - ${formatDate(endDate)}` : ''}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${notes ? `📝 *Notes:* ${notes}\n` : ''}\n` +
        `Please confirm receipt.\n\n` +
        signed('Operations')
    }



    const result = await sendWhatsAppMessage({
      to: resourcePhone,
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
      message: `${resource.name || resourceName} notified successfully`
    })

  } catch (error: any) {
    console.error('❌ Error notifying resource:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
