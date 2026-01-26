import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, requireAuth } from '@/lib/supabase-server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import B2CQuotePDF from '@/components/pdf/B2CQuotePDF'
import B2BQuotePDF from '@/components/pdf/B2BQuotePDF'

/**
 * POST /api/quotes/[type]/[id]/send-whatsapp
 * Send quote via WhatsApp with PDF attachment
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

    // Check if PDF already exists, generate if not
    let pdfUrl = quote.pdf_url

    if (!pdfUrl) {
      // Generate PDF
      let pdfBuffer: Buffer
      if (type === 'b2c') {
        const pdfDoc = createElement(B2CQuotePDF, { quote })
        pdfBuffer = await renderToBuffer(pdfDoc) as Buffer
      } else {
        const pdfDoc = createElement(B2BQuotePDF, { quote })
        pdfBuffer = await renderToBuffer(pdfDoc) as Buffer
      }

      // Upload to Supabase storage
      const fileName = `${tenantId}/${type}/${id}.pdf`
      const { error: uploadError } = await supabaseAdmin.storage
        .from('quote-pdfs')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadError) {
        console.error('Error uploading PDF:', uploadError)
        return NextResponse.json(
          { success: false, error: 'Failed to generate PDF for WhatsApp' },
          { status: 500 }
        )
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('quote-pdfs')
        .getPublicUrl(fileName)

      pdfUrl = urlData.publicUrl

      // Update quote with PDF URL
      const tableName = type === 'b2c' ? 'b2c_quotes' : 'b2b_quotes'
      await supabaseAdmin
        .from(tableName)
        .update({
          pdf_url: pdfUrl,
          pdf_generated_at: new Date().toISOString(),
        })
        .eq('id', id)
    }

    // Build WhatsApp message
    const businessName = process.env.BUSINESS_NAME || 'Autoura'
    const businessEmail = process.env.BUSINESS_EMAIL || 'info@autoura.com'
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    let message = ''

    if (type === 'b2c') {
      const startDate = new Date(quote.itineraries?.start_date || new Date()).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
      const endDate = new Date(quote.itineraries?.end_date || new Date()).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
      })

      message = `🌟 *${businessName}* 🌟\n\n` +
        `Dear ${recipientName},\n\n` +
        `Thank you for your interest in exploring Egypt with us! 🇪🇬\n\n` +
        `📋 *Your Travel Quote - ${quote.quote_number}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 *Tour:* ${quote.itineraries?.trip_name || 'Egypt Tour'}\n` +
        `📅 *Dates:* ${startDate} - ${endDate}\n` +
        `⏱️ *Duration:* ${quote.itineraries?.total_days || 0} days\n` +
        `👥 *Travelers:* ${quote.num_travelers} ${quote.num_travelers === 1 ? 'person' : 'people'}\n` +
        `🏆 *Service Level:* ${quote.tier.charAt(0).toUpperCase() + quote.tier.slice(1)}\n\n` +
        `💰 *TOTAL PRICE: ${quote.currency} ${quote.selling_price.toLocaleString()}*\n` +
        `💵 *Per Person: ${quote.currency} ${quote.price_per_person.toLocaleString()}*\n\n` +
        `📄 *Your detailed quote with full pricing breakdown is attached as a PDF.*\n\n` +
        `✨ *What's Included:*\n` +
        `✅ Professional tour guide\n` +
        `✅ All entrance fees\n` +
        `✅ Private transportation\n` +
        `✅ Meals as specified\n` +
        `✅ Hotel pickups\n\n` +
        (quote.valid_until ? `⏰ *This quote is valid until:* ${new Date(quote.valid_until).toLocaleDateString()}\n\n` : '') +
        (quote.client_notes ? `📝 *Special Notes:* ${quote.client_notes}\n\n` : '') +
        `💳 *Ready to Book?*\n` +
        `Reply to this message or contact us:\n` +
        `📧 ${businessEmail}\n` +
        `🌐 View online: ${baseUrl}/quotes/b2c/${quote.id}\n\n` +
        `We look forward to creating unforgettable memories with you! 🐪✨\n\n` +
        `Best regards,\n${businessName} Team`
    } else {
      // B2B message
      const paxCounts = Object.keys(quote.pricing_table).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b)
      const minPax = paxCounts[0]
      const maxPax = paxCounts[paxCounts.length - 1]
      const lowestPP = quote.pricing_table[maxPax]?.pp || 0

      message = `🌟 *${businessName} - B2B Rate Sheet* 🌟\n\n` +
        `Dear ${recipientName},\n\n` +
        `Please find below your customized B2B rate sheet.\n\n` +
        `📋 *Rate Sheet - ${quote.quote_number}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🎯 *Tour:* ${quote.itineraries?.trip_name || 'Egypt Tour'}\n` +
        `⏱️ *Duration:* ${quote.itineraries?.total_days || 0} days\n` +
        `🏆 *Service Tier:* ${quote.tier.toUpperCase()}\n` +
        `👥 *Pax Range:* ${minPax} - ${maxPax} pax\n` +
        `${quote.tour_leader_included ? '✅ Tour Leader +1 Included\n' : ''}\n` +
        `💰 *Best Rate (Per Person):* ${quote.currency} ${lowestPP.toLocaleString()} @ ${maxPax} pax\n\n` +
        `📄 *Complete multi-pax pricing table and cost breakdown attached as PDF.*\n\n` +
        (quote.season ? `🌞 *Season:* ${quote.season}\n` : '') +
        (quote.valid_from && quote.valid_until ?
          `📅 *Valid:* ${new Date(quote.valid_from).toLocaleDateString()} - ${new Date(quote.valid_until).toLocaleDateString()}\n\n` : '\n') +
        `🌐 *View Full Rate Sheet Online:*\n` +
        `${baseUrl}/quotes/b2b/${quote.id}\n\n` +
        `For bookings or questions, please contact:\n` +
        `📧 ${businessEmail}\n\n` +
        `We look forward to working with you! 🤝\n\n` +
        `Best regards,\n${businessName} B2B Team`
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
