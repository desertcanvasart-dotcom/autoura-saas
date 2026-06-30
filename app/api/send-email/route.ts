import { NextResponse } from 'next/server'
import { generateEmailTemplate } from '@/lib/communication-utils'
import { requireAuth } from '@/lib/supabase-server'
import { sendMail } from '@/lib/email-send'
import { checkAmountDeliverable } from '@/lib/pricing-guards'

export async function POST(request: Request) {
  try {
    // Authenticated users only — this route sends mail through the company
    // mailbox, so it must never be callable anonymously.
    const auth = await requireAuth()
    if (auth.error) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const {
      itineraryId,
      clientName,
      clientEmail,
      itineraryCode,
      tripName,
      totalCost,
      currency,
      pdfBase64
    } = await request.json()

    if (!clientEmail) {
      return NextResponse.json(
        { success: false, error: 'Client email is required' },
        { status: 400 }
      )
    }

    // Itinerary email with PDF — output gate (harness Layer 2): never email a
    // non-deliverable price.
    const priceCheck = checkAmountDeliverable(totalCost, { currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Itinerary price is not deliverable', violations: priceCheck.violations },
        { status: 422 }
      )
    }

    // Generate email HTML
    const emailHtml = generateEmailTemplate(
      clientName,
      itineraryCode,
      tripName,
      totalCost,
      currency
    )

    const result = await sendMail({
      to: clientEmail,
      bcc: process.env.GMAIL_USER || 'info@travel2egypt.org', // BCC to yourself
      fromName: 'Islam Mohamed - Travel2Egypt.org',
      subject: `Your Egypt Tour Itinerary - ${tripName} (${itineraryCode})`,
      html: emailHtml,
      attachments: pdfBase64 ? [{
        filename: `${itineraryCode}_${clientName.replace(/\s+/g, '_')}.pdf`,
        content: pdfBase64,
        encoding: 'base64'
      }] : []
    })

    if (!result.success) {
      if (result.authError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Email authentication failed. Please configure Gmail App Password.',
            details: 'Go to Gmail Settings → Security → App Passwords to generate one.'
          },
          { status: 401 }
        )
      }
      return NextResponse.json(
        { success: false, error: 'Failed to send email', message: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Email sent successfully'
    })

  } catch (error) {
    console.error('Error sending email:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send email',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}