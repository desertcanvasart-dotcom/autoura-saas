import { NextRequest, NextResponse } from 'next/server'
import { quoteSentUpdate } from '@/lib/quotes/quote-sent-update'
import { loadDocumentIdentity } from '@/lib/document-identity'
import { createAdminClient, requireAuth } from '@/lib/supabase-server'
import { checkQuoteRowDeliverable } from '@/lib/pricing-guards'
import { renderToBuffer } from '@react-pdf/renderer'
import { render } from '@react-email/render'
import { createElement } from 'react'
import { Resend } from 'resend'
import B2CQuotePDF from '@/components/pdf/B2CQuotePDF'
import B2BQuotePDF from '@/components/pdf/B2BQuotePDF'
import B2CQuoteEmail from '@/components/emails/B2CQuoteEmail'
import B2BQuoteEmail from '@/components/emails/B2BQuoteEmail'
import { resolveSender } from '@/lib/tenant-email-domain'
import { quoteCompleteness, allowsIncomplete, describeGaps } from '@/lib/pricing/quote-completeness'

// Lazy-initialized Resend client (avoids build-time errors when env vars unavailable)
let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not defined in environment variables')
    }
    _resend = new Resend(apiKey)
  }
  return _resend
}

/**
 * POST /api/quotes/[type]/[id]/send
 * Send quote via email with PDF attachment
 * Multi-tenancy: Users can only send quotes from their own tenant
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { type, id } = await params

    if (type !== 'b2c' && type !== 'b2b') {
      return NextResponse.json(
        { success: false, error: 'Invalid quote type. Must be b2c or b2b' },
        { status: 400 }
      )
    }

    // Authenticate user
    const { supabase, user, tenant_id } = await requireAuth()

    if (!supabase || !user || !tenant_id) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    // The tenant requireAuth() resolved (one membership rule, and the
    // impersonated tenant for a super admin) — never a second lookup.
    const tenantId = tenant_id

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

    // The same completeness gate as the PDF download: a quote with services
    // still at no price was emailed without a word. `allow_incomplete` is the
    // operator saying they mean it (the page asks them first).
    const completeness = quoteCompleteness(quote.services_snapshot)
    if (!completeness.complete && !allowsIncomplete(body.allow_incomplete)) {
      return NextResponse.json(
        {
          success: false,
          error: `This quote has ${completeness.gaps.length} service(s) with no price: ${describeGaps(completeness.gaps)}.`,
          gaps: completeness.gaps,
        },
        { status: 422 }
      )
    }

    // Output gate (harness Layer 2): never email a non-deliverable price.
    const priceCheck = checkQuoteRowDeliverable(quote, type)
    if (!priceCheck.ok) {
      return NextResponse.json(
        {
          success: false,
          error: 'This quote cannot be sent — its price is not deliverable. Resolve the issues and re-price before sending.',
          violations: priceCheck.violations,
        },
        { status: 422 }
      )
    }

    // Who it is from: the tenant (Settings → Organization). The email said
    // "AUTOURA" and "Egypt", listed the platform's own email and phone, and
    // went from the platform's address with no reply-to the agency. Pinned to
    // the tenant requireAuth resolved, as loadSenderTenant is.
    const { data: sender } = await supabaseAdmin
      .from('tenants')
      .select('company_name, tagline, contact_email, company_phone, company_website, email_domain, email_from_local, email_domain_status')
      .eq('id', tenantId)
      .maybeSingle()
    const company = {
      name: sender?.company_name,
      tagline: sender?.tagline,
      email: sender?.contact_email,
      phone: sender?.company_phone,
      website: sender?.company_website,
    }
    const tripName = quote.itineraries?.trip_name || 'Your tour'

    // Generate PDF
    const identity = await loadDocumentIdentity(tenantId)
    let pdfBuffer: Buffer
    if (type === 'b2c') {
      const pdfDoc = createElement(B2CQuotePDF, { quote, company: identity })
      pdfBuffer = await renderToBuffer(pdfDoc as any) as Buffer
    } else {
      const pdfDoc = createElement(B2BQuotePDF, { quote, company: identity })
      pdfBuffer = await renderToBuffer(pdfDoc as any) as Buffer
    }

    // No "view online" link: /quotes/… is the staff page, and every client and
    // partner who clicked it landed on /login. The quote is the attached PDF.
    const viewQuoteUrl = undefined

    // Render email HTML
    let emailHtml: string
    if (type === 'b2c') {
      emailHtml = await render(
        createElement(B2CQuoteEmail, {
          clientName: recipientName,
          quoteNumber: quote.quote_number,
          tripName,
          // No dates yet: the row is left out, not filled with today.
          startDate: quote.itineraries?.start_date ?? null,
          duration: quote.itineraries?.total_days || 0,
          numTravelers: quote.num_travelers,
          pricePerPerson: quote.price_per_person,
          totalPrice: quote.selling_price,
          currency: quote.currency,
          validUntil: quote.valid_until,
          clientNotes: quote.client_notes,
          viewQuoteUrl,
          company,
        })
      )
    } else {
      emailHtml = await render(
        createElement(B2BQuoteEmail, {
          partnerName: quote.b2b_partners?.company_name || 'Partner',
          contactName: quote.b2b_partners?.contact_name,
          quoteNumber: quote.quote_number,
          tripName,
          // No dates yet: the row is left out, not filled with today.
          startDate: quote.itineraries?.start_date ?? null,
          duration: quote.itineraries?.total_days || 0,
          tier: quote.tier,
          tourLeaderIncluded: quote.tour_leader_included,
          pricingTable: quote.pricing_table,
          currency: quote.currency,
          validFrom: quote.valid_from,
          validUntil: quote.valid_until,
          season: quote.season,
          viewQuoteUrl,
          company,
        })
      )
    }

    // Send email with Resend
    const emailSubject = type === 'b2c'
      ? `Your Travel Quote - ${quote.quote_number}`
      : `B2B Rate Sheet - ${quote.quote_number} - ${tripName}`

    const { data: emailData, error: emailError } = await getResend().emails.send({
      // The tenant's own verified domain, else the platform address under
      // the tenant's name (lib/tenant-email-domain) — as /api/send-email.
      from: resolveSender(sender, process.env.RESEND_FROM_EMAIL || 'quotes@getautoura.net').from,
      ...(sender?.contact_email ? { replyTo: sender.contact_email } : {}),
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

    // Update quote status (lib/quotes/quote-sent-update: b2b_quotes has no
    // sent_at/sent_via, and only a draft becomes 'sent').
    const updateData = quoteSentUpdate(type, quote.status, 'email')
    const tableName = type === 'b2c' ? 'b2c_quotes' : 'b2b_quotes'
    const { error: updateError } = updateData
      ? await supabaseAdmin
          .from(tableName)
          .update(updateData)
          .eq('id', id)
          .eq('tenant_id', tenantId)
      : { error: null }

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
