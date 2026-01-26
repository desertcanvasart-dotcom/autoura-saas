import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, requireAuth } from '@/lib/supabase-server'
import { renderToBuffer } from '@react-pdf/renderer'
import { render } from '@react-email/render'
import { createElement } from 'react'
import { Resend } from 'resend'
import B2CQuotePDF from '@/components/pdf/B2CQuotePDF'
import B2BQuotePDF from '@/components/pdf/B2BQuotePDF'
import B2CQuoteEmail from '@/components/emails/B2CQuoteEmail'
import B2BQuoteEmail from '@/components/emails/B2BQuoteEmail'

const resend = new Resend(process.env.RESEND_API_KEY!)

/**
 * POST /api/quotes/[type]/[id]/send
 * Send quote via email with PDF attachment
 * Multi-tenancy: Users can only send quotes from their own tenant
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const { type, id } = params

    if (type !== 'b2c' && type !== 'b2b') {
      return NextResponse.json(
        { success: false, error: 'Invalid quote type. Must be b2c or b2b' },
        { status: 400 }
      )
    }

    // Authenticate user
    const { supabase, user } = await requireAuth()

    // Get user's tenant
    const { data: membership } = await supabase
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'User does not belong to any tenant' },
        { status: 403 }
      )
    }

    const tenantId = membership.tenant_id

    // Use admin client for operations (needed for status updates)
    const supabaseAdmin = createAdminClient()

    // Get recipient email from request body (optional override)
    const body = await request.json().catch(() => ({}))
    const recipientEmail = body.email

    // Fetch quote data
    let quote: any = null
    let recipientName = ''
    let defaultEmail = ''

    if (type === 'b2c') {
      const { data, error } = await supabaseAdmin
        .from('b2c_quotes')
        .select(`
          *,
          clients (
            full_name,
            email,
            phone,
            nationality
          ),
          itineraries (
            itinerary_code,
            trip_name,
            start_date,
            end_date,
            total_days
          )
        `)
        .eq('id', id)
        .eq('tenant_id', tenantId) // Multi-tenancy check
        .single()

      if (error) throw error
      quote = data

      if (!quote.clients) {
        return NextResponse.json(
          { success: false, error: 'Quote has no associated client' },
          { status: 400 }
        )
      }

      recipientName = quote.clients.full_name
      defaultEmail = quote.clients.email
    } else {
      const { data, error } = await supabaseAdmin
        .from('b2b_quotes')
        .select(`
          *,
          b2b_partners (
            company_name,
            partner_code,
            contact_name,
            email,
            phone,
            country
          ),
          itineraries (
            itinerary_code,
            trip_name,
            start_date,
            total_days
          )
        `)
        .eq('id', id)
        .eq('tenant_id', tenantId) // Multi-tenancy check
        .single()

      if (error) throw error
      quote = data

      if (!quote.b2b_partners) {
        return NextResponse.json(
          { success: false, error: 'Quote has no associated partner' },
          { status: 400 }
        )
      }

      recipientName = quote.b2b_partners.contact_name || quote.b2b_partners.company_name
      defaultEmail = quote.b2b_partners.email
    }

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Quote not found' },
        { status: 404 }
      )
    }

    // Use recipient email from request or default from quote
    const toEmail = recipientEmail || defaultEmail

    if (!toEmail) {
      return NextResponse.json(
        { success: false, error: 'No recipient email address found' },
        { status: 400 }
      )
    }

    // Generate PDF
    let pdfBuffer: Buffer
    if (type === 'b2c') {
      const pdfDoc = createElement(B2CQuotePDF, { quote })
      pdfBuffer = await renderToBuffer(pdfDoc) as Buffer
    } else {
      const pdfDoc = createElement(B2BQuotePDF, { quote })
      pdfBuffer = await renderToBuffer(pdfDoc) as Buffer
    }

    // Prepare view quote URL (you can customize this based on your domain)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const viewQuoteUrl = `${baseUrl}/quotes/${type}/${quote.id}`

    // Render email HTML
    let emailHtml: string
    if (type === 'b2c') {
      emailHtml = render(
        createElement(B2CQuoteEmail, {
          clientName: recipientName,
          quoteNumber: quote.quote_number,
          tripName: quote.itineraries?.trip_name || 'Egypt Tour',
          startDate: quote.itineraries?.start_date || new Date().toISOString(),
          duration: quote.itineraries?.total_days || 0,
          numTravelers: quote.num_travelers,
          pricePerPerson: quote.price_per_person,
          totalPrice: quote.selling_price,
          currency: quote.currency,
          validUntil: quote.valid_until,
          clientNotes: quote.client_notes,
          viewQuoteUrl,
        })
      )
    } else {
      emailHtml = render(
        createElement(B2BQuoteEmail, {
          partnerName: quote.b2b_partners?.company_name || 'Partner',
          contactName: quote.b2b_partners?.contact_name,
          quoteNumber: quote.quote_number,
          tripName: quote.itineraries?.trip_name || 'Egypt Tour',
          startDate: quote.itineraries?.start_date || new Date().toISOString(),
          duration: quote.itineraries?.total_days || 0,
          tier: quote.tier,
          tourLeaderIncluded: quote.tour_leader_included,
          pricingTable: quote.pricing_table,
          currency: quote.currency,
          validFrom: quote.valid_from,
          validUntil: quote.valid_until,
          season: quote.season,
          viewQuoteUrl,
        })
      )
    }

    // Send email with Resend
    const emailSubject = type === 'b2c'
      ? `Your Egypt Travel Quote - ${quote.quote_number}`
      : `B2B Rate Sheet - ${quote.quote_number} - ${quote.itineraries?.trip_name || 'Egypt Tour'}`

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Autoura <quotes@autoura.com>',
      to: toEmail,
      subject: emailSubject,
      html: emailHtml,
      attachments: [
        {
          filename: `${quote.quote_number}.pdf`,
          content: pdfBuffer,
        },
      ],
    })

    if (emailError) {
      console.error('Email sending error:', emailError)
      throw new Error(`Failed to send email: ${emailError.message}`)
    }

    // Update quote status
    const updateData: any = {
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_via: 'email',
    }

    const tableName = type === 'b2c' ? 'b2c_quotes' : 'b2b_quotes'
    const { error: updateError } = await supabaseAdmin
      .from(tableName)
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      console.error('Quote update error:', updateError)
      // Don't fail if update fails, email was sent successfully
    }

    return NextResponse.json({
      success: true,
      message: 'Quote sent successfully',
      email: toEmail,
      emailId: emailData?.id,
    })

  } catch (error: any) {
    console.error('Quote sending error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send quote' },
      { status: 500 }
    )
  }
}
