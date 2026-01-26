import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { requireAuth } from '@/lib/supabase-server'

type BookingStatus = 'confirmed' | 'cancelled' | 'pending_payment' | 'paid' | 'completed'

function getStatusMessage(
  clientName: string,
  tourName: string,
  status: BookingStatus,
  notes?: string
): string {
  const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
  const emoji = {
    confirmed: '✅',
    cancelled: '❌',
    pending_payment: '💳',
    paid: '✅',
    completed: '🎉'
  }[status]

  let message = `${emoji} *${businessName}* ${emoji}\n\n`
  message += `Dear ${clientName},\n\n`

  switch (status) {
    case 'confirmed':
      message += `Great news! Your booking for *${tourName}* has been confirmed! 🎉\n\n`
      message += `We're excited to show you the wonders of Egypt! Your guide will contact you 24 hours before your tour with pickup details.\n\n`
      message += `If you have any questions, feel free to reach out anytime.`
      break

    case 'cancelled':
      message += `Your booking for *${tourName}* has been cancelled as requested.\n\n`
      if (notes) {
        message += `Note: ${notes}\n\n`
      }
      message += `If you'd like to reschedule or book another tour, we're here to help!`
      break

    case 'pending_payment':
      message += `Your booking for *${tourName}* is confirmed! We're just waiting for your payment to finalize everything.\n\n`
      message += `💳 Payment details have been sent to your email.\n\n`
      message += `Once payment is received, you're all set! 🎯`
      break

    case 'paid':
      message += `Thank you! We've received your payment for *${tourName}*. ✅\n\n`
      message += `Everything is confirmed and ready to go! Your guide will contact you 24 hours before your tour.\n\n`
      message += `Get ready for an amazing adventure! 🐪✨`
      break

    case 'completed':
      message += `Thank you for choosing ${businessName} for your *${tourName}*! 🎉\n\n`
      message += `We hope you had an incredible experience exploring Egypt! 🇪🇬\n\n`
      message += `We'd love to hear your feedback. If you enjoyed your tour, please consider leaving us a review!\n\n`
      message += `We hope to see you again soon! 🌟`
      break
  }

  message += `\n\nBest regards,\n${businessName} Team`
  return message
}

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
    const { itineraryId, status, notes } = body

    console.log('📤 Status update request:', { itineraryId, status })

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      )
    }

    if (!status) {
      return NextResponse.json(
        { success: false, error: 'Status is required' },
        { status: 400 }
      )
    }

    const validStatuses: BookingStatus[] = ['confirmed', 'cancelled', 'pending_payment', 'paid', 'completed']
    if (!validStatuses.includes(status as BookingStatus)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Get itinerary
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

    if (!itinerary.client_phone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number not found in itinerary' },
        { status: 400 }
      )
    }

    // Build message
    const message = getStatusMessage(
      itinerary.client_name || 'Valued Client',
      itinerary.trip_name || itinerary.tour_name || 'Egypt Tour',
      status as BookingStatus,
      notes
    )

    console.log('📤 Sending to:', itinerary.client_phone)

    // Send via WhatsApp
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

    // Update itinerary status
    await supabase
      .from('itineraries')
      .update({
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', itineraryId)

    console.log('✅ Status update sent:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Status update sent successfully via WhatsApp'
    })

  } catch (error: any) {
    console.error('❌ Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}