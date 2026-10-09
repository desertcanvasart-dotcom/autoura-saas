import { formatMoney } from '@/lib/currency-totals'
import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { createAdminClient, requireAuth } from '@/lib/supabase-server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { checkQuoteRowDeliverable } from '@/lib/pricing-guards'
import { freshQuotePdf } from '@/lib/quotes/fresh-quote-pdf'
import { quoteCompleteness, allowsIncomplete, describeGaps } from '@/lib/pricing/quote-completeness'

/**
 * POST /api/quotes/[type]/[id]/send-whatsapp
 * Send quote via WhatsApp with PDF attachment
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

    // Use admin client for operations
    const supabaseAdmin = createAdminClient()

    // Get phone number from request body (optional override)
    const body = await request.json().catch(() => ({}))
    const recipientPhone = body.phone

    // Fetch quote data
    let quote: any = null
    let recipientName = ''
    let defaultPhone = ''

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
      defaultPhone = quote.clients.phone
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
      defaultPhone = quote.b2b_partners.phone
    }

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Quote not found' },
        { status: 404 }
      )
    }

    // Use recipient phone from request or default from quote
    const toPhone = recipientPhone || defaultPhone

    if (!toPhone) {
      return NextResponse.json(
        { success: false, error: 'No recipient phone number found' },
        { status: 400 }
      )
    }

    // The same completeness gate as the PDF download (see the email route).
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

    // Output gate (harness Layer 2): never WhatsApp a non-deliverable price.
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

    // A fresh PDF for every send (lib/quotes/fresh-quote-pdf): it reused
    // quote.pdf_url, which expired after 7 days or showed old prices.
    const fresh = await freshQuotePdf(supabaseAdmin, { type, quote, tenantId })
    if (!fresh.ok) {
      console.error('Error uploading PDF:', fresh.error)
      return NextResponse.json(
        { success: false, error: 'Failed to generate PDF for WhatsApp' },
        { status: 500 }
      )
    }
    const pdfUrl = fresh.url

    // Build WhatsApp message
    // The tenant's own name and email (Settings → Organization) — the email
    // was the platform's (BUSINESS_EMAIL, else hello@getautoura.net).
    const senderTenant = await loadSenderTenant(tenant_id)
    const businessName = senderTenant?.company_name || ''
    const businessEmail = senderTenant?.contact_email || ''
    const tripName = quote.itineraries?.trip_name || 'Your tour'
    // "8 November 2026", never toLocaleDateString()'s bare "11/8/2026" (read
    // as 8 Nov or 11 Aug depending on who reads it); money in its currency's
    // decimals and separators, never "EUR 1,250.5".
    const day = (d: string | null | undefined) => {
      const t = d ? new Date(d) : null
      return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null
    }
    const contactLines = businessEmail ? `📧 ${businessEmail}\n` : ''

    let message = ''

    if (type === 'b2c') {
      // No dates yet: no Dates line, never today's date.
      const startDate = day(quote.itineraries?.start_date)
      const endDate = day(quote.itineraries?.end_date)

      message = (businessName ? `🌟 *${businessName}* 🌟\n\n` : '') +
        `Dear ${recipientName},\n\n` +
        `Thank you for your interest in travelling with us!\n\n` +
        `📋 *Your Travel Quote - ${quote.quote_number}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 *Tour:* ${tripName}\n` +
        (startDate ? `📅 *Dates:* ${startDate}${endDate ? ` - ${endDate}` : ''}\n` : '') +
        `⏱️ *Duration:* ${quote.itineraries?.total_days || 0} days\n` +
        `👥 *Travelers:* ${quote.num_travelers} ${quote.num_travelers === 1 ? 'person' : 'people'}\n` +
        `🏆 *Service Level:* ${quote.tier.charAt(0).toUpperCase() + quote.tier.slice(1)}\n\n` +
        `💰 *TOTAL PRICE: ${formatMoney(quote.selling_price, quote.currency)}*\n` +
        `💵 *Per Person: ${formatMoney(quote.price_per_person, quote.currency)}*\n\n` +
        // What is included is in the attached quote — not a fixed list that
        // promised a guide, entrance fees and meals whatever was quoted.
        `📄 *Your detailed quote with what is included and the full pricing breakdown is attached as a PDF.*\n\n` +
        (quote.valid_until ? `⏰ *This quote is valid until:* ${day(quote.valid_until)}\n\n` : '') +
        (quote.client_notes ? `📝 *Special Notes:* ${quote.client_notes}\n\n` : '') +
        `💳 *Ready to Book?*\n` +
        `Reply to this message${businessEmail ? ' or contact us:' : '.'}\n` +
        contactLines +
        `We look forward to creating unforgettable memories with you! ✨\n\n` +
        (businessName ? `Best regards,\n${businessName} Team` : 'Best regards,')
    } else {
      // B2B message
      const paxCounts = Object.keys(quote.pricing_table).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b)
      const minPax = paxCounts[0]
      const maxPax = paxCounts[paxCounts.length - 1]
      const lowestPP = quote.pricing_table[maxPax]?.pp || 0

      message = `🌟 *${businessName ? `${businessName} - ` : ''}B2B Rate Sheet* 🌟\n\n` +
        `Dear ${recipientName},\n\n` +
        `Please find below your customized B2B rate sheet.\n\n` +
        `📋 *Rate Sheet - ${quote.quote_number}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 *Tour:* ${tripName}\n` +
        `⏱️ *Duration:* ${quote.itineraries?.total_days || 0} days\n` +
        `🏆 *Service Tier:* ${quote.tier.toUpperCase()}\n` +
        `👥 *Pax Range:* ${minPax} - ${maxPax} pax\n` +
        `${quote.tour_leader_included ? '✅ Tour Leader +1 Included\n' : ''}\n` +
        `💰 *Best Rate (Per Person):* ${formatMoney(lowestPP, quote.currency)} @ ${maxPax} pax\n\n` +
        `📄 *Complete multi-pax pricing table and cost breakdown attached as PDF.*\n\n` +
        (quote.season ? `🌞 *Season:* ${quote.season}\n` : '') +
        (quote.valid_from && quote.valid_until ?
          `📅 *Valid:* ${day(quote.valid_from)} - ${day(quote.valid_until)}\n\n` : '\n') +
        '\n' +
        (businessEmail ? `For bookings or questions, please contact:\n${contactLines}\n` : '') +
        `We look forward to working with you! 🤝\n\n` +
        (businessName ? `Best regards,\n${businessName} B2B Team` : 'Best regards,')
    }

    // Send via WhatsApp
    const result = await sendWhatsAppMessage({
      to: toPhone,
      body: message,
      mediaUrl: pdfUrl
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send WhatsApp message' },
        { status: 500 }
      )
    }

    // Update quote status
    const updateData: any = {
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_via: 'whatsapp',
    }

    const tableName = type === 'b2c' ? 'b2c_quotes' : 'b2b_quotes'
    const { error: updateError } = await supabaseAdmin
      .from(tableName)
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      console.error('Quote update error:', updateError)
      // Don't fail if update fails, message was sent successfully
    }

    return NextResponse.json({
      success: true,
      message: 'Quote sent successfully via WhatsApp',
      phone: toPhone,
      messageId: result.messageId,
      warning: result.warning,
    })

  } catch (error: any) {
    console.error('WhatsApp sending error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send quote via WhatsApp' },
      { status: 500 }
    )
  }
}
