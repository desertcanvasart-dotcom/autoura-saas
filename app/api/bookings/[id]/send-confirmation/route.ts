import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('📧 Sending booking confirmation:', params.id)

    const authResult = await requireAuth()
    if (authResult.error) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status }
      )
    }

    const { tenant_id, role } = authResult

    // Only managers and above can send confirmations
    if (!['owner', 'admin', 'manager'].includes(role || '')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    const adminClient = createAdminClient()
    const body = await request.json()
    const { send_via = 'email', include_deposit_invoice = true } = body

    // Fetch booking with related data
    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select(`
        *,
        itineraries (
          id,
          itinerary_code,
          trip_name,
          client_name
        ),
        clients (
          id,
          full_name,
          email,
          phone,
          whatsapp
        )
      `)
      .eq('id', params.id)
      .eq('tenant_id', tenant_id)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      )
    }

    if (booking.quote_type !== 'b2c') {
      return NextResponse.json(
        { success: false, error: 'Confirmations are only available for B2C bookings' },
        { status: 400 }
      )
    }

    // Check if client has contact info
    const client = booking.clients
    if (!client?.email && send_via === 'email') {
      return NextResponse.json(
        { success: false, error: 'Client email not found' },
        { status: 400 }
      )
    }

    if (!client?.whatsapp && send_via === 'whatsapp') {
      return NextResponse.json(
        { success: false, error: 'Client WhatsApp number not found' },
        { status: 400 }
      )
    }

    // Generate confirmation message
    const confirmationMessage = `
Dear ${client?.full_name || 'Valued Customer'},

Thank you for booking with us! Your booking is confirmed.

📋 Booking Details:
━━━━━━━━━━━━━━━━━━━━━
🎫 Booking Number: ${booking.booking_number}
✈️ Trip: ${booking.trip_name}
📅 Dates: ${new Date(booking.start_date).toLocaleDateString()} - ${new Date(booking.end_date).toLocaleDateString()}
👥 Travelers: ${booking.num_travelers}
💰 Total Amount: ${booking.currency} ${booking.total_amount.toFixed(2)}

📊 Payment Status:
━━━━━━━━━━━━━━━━━━━━━
✅ Paid: ${booking.currency} ${booking.total_paid.toFixed(2)}
⏳ Balance: ${booking.currency} ${booking.balance_due.toFixed(2)}
${booking.balance_due > 0 ? `📆 Payment Due: ${new Date(booking.payment_deadline).toLocaleDateString()}` : ''}

${booking.special_requests ? `\n📝 Special Requests:\n${booking.special_requests}\n` : ''}

We look forward to serving you!

Best regards,
Your Travel Team
    `.trim()

    // Send via email or WhatsApp
    if (send_via === 'email') {
      // TODO: Integrate with existing email system
      // For now, return the message that would be sent
      console.log('📧 Would send email to:', client?.email)
      console.log('Message:', confirmationMessage)

      return NextResponse.json({
        success: true,
        message: 'Confirmation would be sent via email (email integration pending)',
        preview: {
          to: client?.email,
          subject: `Booking Confirmation - ${booking.booking_number}`,
          body: confirmationMessage
        }
      })
    } else if (send_via === 'whatsapp') {
      // TODO: Integrate with WhatsApp API
      console.log('📱 Would send WhatsApp to:', client?.whatsapp_number)
      console.log('Message:', confirmationMessage)

      return NextResponse.json({
        success: true,
        message: 'Confirmation would be sent via WhatsApp (WhatsApp integration pending)',
        preview: {
          to: client?.whatsapp_number,
          message: confirmationMessage
        }
      })
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid send_via parameter. Must be "email" or "whatsapp"'
      },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error('❌ Error sending confirmation:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
