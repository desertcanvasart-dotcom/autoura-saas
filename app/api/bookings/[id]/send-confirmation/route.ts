import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendSystemEmail } from '@/lib/email'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import {
  confirmationRecipient, confirmationText, confirmationEmail, fromWithCompany,
  type ConfirmationBooking,
} from '@/lib/bookings/confirmation-message'

// POST /api/bookings/[id]/send-confirmation  { send_via: 'email' | 'whatsapp' }
//
// Sends the booking confirmation — it used to build the text and return it
// as a "preview" ("integration pending"), sending nothing, and refused every
// booking made by confirming an itinerary. Direct and B2C bookings now send;
// a partner (B2B) booking is confirmed to the partner, not from here.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const authResult = await requireAuth()
    if (authResult.error !== null) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    }
    const { tenant_id, role } = authResult
    if (!['owner', 'admin', 'manager'].includes(role || '')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const sendVia = body.send_via === 'whatsapp' ? 'whatsapp' : body.send_via === 'email' || body.send_via === undefined ? 'email' : null
    if (!sendVia) {
      return NextResponse.json({ success: false, error: 'send_via must be "email" or "whatsapp"' }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await createAdminClient()
      .from('bookings')
      .select(`
        booking_number, quote_type, trip_name, start_date, end_date, num_travelers, currency,
        total_amount, total_paid, balance_due, deposit_amount, payment_deadline, special_requests,
        itineraries ( client_name, client_email, client_phone ),
        clients ( full_name, email, phone, whatsapp )
      `)
      .eq('id', id)
      .eq('tenant_id', tenant_id)
      .maybeSingle()
    if (bookingError || !booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 })
    }
    if (booking.quote_type === 'b2b') {
      return NextResponse.json({ success: false, error: 'A partner booking is confirmed to the partner, not from here' }, { status: 400 })
    }

    const b = booking as unknown as ConfirmationBooking
    const to = confirmationRecipient(b)
    const tenant = await loadSenderTenant(tenant_id)
    const company = tenant?.company_name || ''

    if (sendVia === 'email') {
      if (!to.email) {
        return NextResponse.json({ success: false, error: 'No email address for this client — add one to the client or the itinerary' }, { status: 400 })
      }
      const { subject, html } = confirmationEmail(b, company)
      const result = await sendSystemEmail({
        to: to.email,
        subject,
        html,
        from: fromWithCompany(company, process.env.RESEND_FROM_EMAIL),
        ...(tenant?.contact_email ? { replyTo: tenant.contact_email } : {}),
      })
      if (!result.sent) {
        return NextResponse.json({ success: false, error: 'Email is not configured (RESEND_API_KEY) — nothing was sent' }, { status: 503 })
      }
      return NextResponse.json({ success: true, message: `Confirmation emailed to ${to.email}` })
    }

    if (!to.whatsapp) {
      return NextResponse.json({ success: false, error: 'No WhatsApp or phone number for this client' }, { status: 400 })
    }
    const result = await sendWhatsAppMessage({ to: to.whatsapp, body: confirmationText(b, company) })
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'WhatsApp send failed' }, { status: 502 })
    }
    return NextResponse.json({ success: true, message: `Confirmation sent by WhatsApp to ${to.whatsapp}` })
  } catch (error) {
    console.error('Error sending confirmation:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
