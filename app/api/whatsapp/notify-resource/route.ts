import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { itineraryId, resourceId, resourceType, resourceName, startDate, endDate, notes } = body

    console.log('📤 Notify resource request:', { itineraryId, resourceId, resourceType })

    if (!itineraryId || !resourceId || !resourceType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Create server-side Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get itinerary details
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

    // Map resource type to table name
    const tableMap: Record<string, string> = {
      'restaurant': 'suppliers',
      'airport_staff': 'suppliers',
      'hotel_staff': 'suppliers'
    }

    const tableName = tableMap[resourceType] || 'suppliers'

    // Get resource details from suppliers table
    const { data: resource, error: resourceError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', resourceId)
      .single()

    if (resourceError || !resource) {
      console.error('❌ Resource error:', resourceError)
      return NextResponse.json(
        { success: false, error: 'Resource not found' },
        { status: 404 }
      )
    }

    console.log('📱 Resource found:', { name: resource.name, phone: resource.phone })

    if (!resource.phone) {
      return NextResponse.json(
        { success: false, error: `No phone number found for ${resource.name || resourceName}` },
        { status: 400 }
      )
    }

    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    
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
    const guestCount = `${itinerary.num_adults || 1} adult${(itinerary.num_adults || 1) > 1 ? 's' : ''}` +
      `${itinerary.num_children > 0 ? `, ${itinerary.num_children} child${itinerary.num_children > 1 ? 'ren' : ''}` : ''}`

    // Generate message based on resource type
    let message = ''
    
    if (resourceType === 'restaurant') {
      message = `🍽️ *${businessName} - Reservation Request*\n\n` +
        `Hello ${resource.name},\n\n` +
        `We would like to make a reservation:\n\n` +
        `📅 *Date:* ${formatDate(startDate)}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `👤 *Client Name:* ${itinerary.client_name || 'N/A'}\n` +
        `${notes ? `📝 *Special Requests:* ${notes}\n` : ''}\n` +
        `Please confirm availability.\n\n` +
        `Thank you!\n` +
        `${businessName} Team`
        
    } else if (resourceType === 'airport_staff') {
      message = `✈️ *${businessName} - Airport Assignment*\n\n` +
        `Hello ${resource.name},\n\n` +
        `You have been assigned to airport duty:\n\n` +
        `📅 *Date:* ${formatDate(startDate)}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `📞 *Client Phone:* ${itinerary.client_phone || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${itinerary.pickup_location ? `📍 *Location:* ${itinerary.pickup_location}\n` : ''}` +
        `${itinerary.pickup_time ? `🕐 *Time:* ${itinerary.pickup_time}\n` : ''}` +
        `${notes ? `📝 *Notes:* ${notes}\n` : ''}\n` +
        `Please confirm receipt of this assignment.\n\n` +
        `${businessName} Operations`
        
    } else if (resourceType === 'hotel_staff') {
      message = `🏨 *${businessName} - Hotel Assignment*\n\n` +
        `Hello ${resource.name},\n\n` +
        `You have been assigned to hotel duty:\n\n` +
        `📅 *Dates:* ${formatDate(startDate)}` +
        `${endDate && endDate !== startDate ? ` - ${formatDate(endDate)}` : ''}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `📞 *Client Phone:* ${itinerary.client_phone || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${notes ? `📝 *Notes:* ${notes}\n` : ''}\n` +
        `Please confirm receipt of this assignment.\n\n` +
        `${businessName} Operations`
    } else {
      // Generic message for other resource types
      message = `📋 *${businessName} - Assignment*\n\n` +
        `Hello ${resource.name},\n\n` +
        `You have been assigned:\n\n` +
        `📅 *Date:* ${formatDate(startDate)}` +
        `${endDate && endDate !== startDate ? ` - ${formatDate(endDate)}` : ''}\n` +
        `👤 *Client:* ${itinerary.client_name || 'N/A'}\n` +
        `👥 *Guests:* ${guestCount}\n` +
        `${notes ? `📝 *Notes:* ${notes}\n` : ''}\n` +
        `Please confirm receipt.\n\n` +
        `${businessName} Operations`
    }

    console.log('📤 Sending to:', resource.phone)

    // Send via WhatsApp
    const result = await sendWhatsAppMessage({
      to: resource.phone,
      body: message
    })

    if (!result.success) {
      console.error('❌ WhatsApp error:', result.error)
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    console.log(`✅ WhatsApp sent to ${resourceType}:`, result.messageId)

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