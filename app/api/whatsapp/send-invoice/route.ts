import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { requireAuth } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// Generate Invoice PDF
async function generateInvoicePDF(invoice: any): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([595, 842]) // A4
  
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  
  const { width, height } = page.getSize()
  const margin = 50
  let y = height - 50

  const currencySymbol = ({ EUR: '€', USD: '$', GBP: '£' } as Record<string, string>)[invoice.currency] || invoice.currency

  // Header
  page.drawText('Travel2Egypt', {
    x: margin, y, size: 24, font: helveticaBold, color: rgb(0.39, 0.49, 0.28)
  })
  
  page.drawText('INVOICE', {
    x: width - margin - 80, y, size: 20, font: helveticaBold, color: rgb(0.2, 0.2, 0.2)
  })
  y -= 30

  // Invoice details
  page.drawText(`Invoice: ${invoice.invoice_number}`, {
    x: margin, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4)
  })
  
  const typeLabel = invoice.invoice_type === 'deposit' 
    ? `Deposit (${invoice.deposit_percent}%)`
    : invoice.invoice_type === 'final' ? 'Final Balance' : 'Standard'
  page.drawText(`Type: ${typeLabel}`, {
    x: width - margin - 100, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4)
  })
  y -= 15

  page.drawText(`Issue Date: ${new Date(invoice.issue_date).toLocaleDateString('en-GB')}`, {
    x: margin, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4)
  })
  page.drawText(`Due: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-GB') : 'On Arrival'}`, {
    x: width - margin - 100, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4)
  })
  y -= 30

  // Divider
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8)
  })
  y -= 25

  // Bill To
  page.drawText('BILL TO', { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.5, 0.5, 0.5) })
  y -= 15
  page.drawText(invoice.client_name, { x: margin, y, size: 12, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  y -= 15
  if (invoice.client_email) {
    page.drawText(invoice.client_email, { x: margin, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
    y -= 15
  }
  y -= 20

  // Line Items Header
  page.drawRectangle({
    x: margin, y: y - 5, width: width - 2 * margin, height: 25,
    color: rgb(0.95, 0.95, 0.95)
  })
  
  page.drawText('Description', { x: margin + 10, y: y + 5, size: 9, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) })
  page.drawText('Qty', { x: 350, y: y + 5, size: 9, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) })
  page.drawText('Price', { x: 400, y: y + 5, size: 9, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) })
  page.drawText('Amount', { x: 480, y: y + 5, size: 9, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) })
  y -= 30

  // Line Items
  const lineItems = invoice.line_items || []
  for (const item of lineItems) {
    const description = item.description.length > 45 
      ? item.description.substring(0, 45) + '...' 
      : item.description
    
    page.drawText(description, { x: margin + 10, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) })
    page.drawText(String(item.quantity), { x: 350, y, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(`${currencySymbol}${Number(item.unit_price).toFixed(2)}`, { x: 400, y, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(`${currencySymbol}${Number(item.amount).toFixed(2)}`, { x: 480, y, size: 10, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
    y -= 20
  }
  y -= 10

  // Divider
  page.drawLine({
    start: { x: 350, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8)
  })
  y -= 20

  // Totals
  page.drawText('Subtotal:', { x: 400, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
  page.drawText(`${currencySymbol}${Number(invoice.subtotal).toFixed(2)}`, { x: 480, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) })
  y -= 18

  if (Number(invoice.tax_amount) > 0) {
    page.drawText(`Tax (${invoice.tax_rate}%):`, { x: 400, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
    page.drawText(`${currencySymbol}${Number(invoice.tax_amount).toFixed(2)}`, { x: 480, y, size: 10, font: helvetica, color: rgb(0.2, 0.2, 0.2) })
    y -= 18
  }

  if (Number(invoice.discount_amount) > 0) {
    page.drawText('Discount:', { x: 400, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
    page.drawText(`-${currencySymbol}${Number(invoice.discount_amount).toFixed(2)}`, { x: 480, y, size: 10, font: helvetica, color: rgb(0.0, 0.5, 0.0) })
    y -= 18
  }

  y -= 5
  page.drawLine({
    start: { x: 350, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.39, 0.49, 0.28)
  })
  y -= 20

  // Total
  page.drawText('TOTAL:', { x: 400, y, size: 12, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  page.drawText(`${currencySymbol}${Number(invoice.total_amount).toFixed(2)}`, { x: 480, y, size: 14, font: helveticaBold, color: rgb(0.39, 0.49, 0.28) })
  y -= 25

  // Amount Paid & Balance
  page.drawText('Amount Paid:', { x: 400, y, size: 10, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
  page.drawText(`${currencySymbol}${Number(invoice.amount_paid).toFixed(2)}`, { x: 480, y, size: 10, font: helvetica, color: rgb(0.0, 0.5, 0.0) })
  y -= 18

  page.drawText('Balance Due:', { x: 400, y, size: 11, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) })
  const balanceColor = Number(invoice.balance_due) > 0 ? rgb(0.8, 0.2, 0.2) : rgb(0.0, 0.5, 0.0)
  page.drawText(`${currencySymbol}${Number(invoice.balance_due).toFixed(2)}`, { x: 480, y, size: 12, font: helveticaBold, color: balanceColor })
  y -= 40

  // Payment Terms
  if (invoice.payment_terms) {
    page.drawText('Payment Terms:', { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) })
    y -= 15
    page.drawText(invoice.payment_terms, { x: margin, y, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
    y -= 25
  }

  // Notes
  if (invoice.notes) {
    page.drawText('Notes:', { x: margin, y, size: 10, font: helveticaBold, color: rgb(0.3, 0.3, 0.3) })
    y -= 15
    page.drawText(invoice.notes, { x: margin, y, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4) })
  }

  // Footer
  page.drawText('Travel2Egypt | www.travel2egypt.org | info@travel2egypt.org', {
    x: width / 2 - 100, y: 30, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5)
  })

  return await pdfDoc.save()
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
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { invoiceId } = body

    console.log('📤 Send invoice request:', { invoiceId })

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'Invoice ID is required' },
        { status: 400 }
      )
    }

    // Use admin client for storage operations only (authenticated supabase for queries)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { success: false, error: `Invoice not found: ${invoiceError?.message || 'No data'}` },
        { status: 404 }
      )
    }

    // Get client phone
    let clientPhone = null
    if (invoice.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('phone')
        .eq('id', invoice.client_id)
        .single()
      clientPhone = client?.phone
    }

    if (!clientPhone && invoice.itinerary_id) {
      const { data: itinerary } = await supabase
        .from('itineraries')
        .select('client_phone')
        .eq('id', invoice.itinerary_id)
        .single()
      clientPhone = itinerary?.client_phone
    }

    if (!clientPhone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number not found. Please add phone to client profile.' },
        { status: 400 }
      )
    }

    // Generate PDF
    console.log('📄 Generating invoice PDF...')
    const pdfBytes = await generateInvoicePDF(invoice)

    // Upload to Supabase Storage (use admin client for storage)
    console.log('📤 Uploading PDF to storage...')
    const fileName = `invoices/invoice-${invoice.invoice_number}-${Date.now()}.pdf`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('documents')
      .upload(fileName, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true
      })

    if (uploadError) {
      console.error('❌ Upload error:', uploadError)
      throw new Error(`Failed to upload PDF: ${uploadError.message}`)
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('documents')
      .getPublicUrl(fileName)

    const pdfUrl = urlData.publicUrl
    console.log('✅ PDF uploaded:', pdfUrl)

    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    const businessEmail = process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'
    const currencySymbol = ({ EUR: '€', USD: '$', GBP: '£' } as Record<string, string>)[invoice.currency] || invoice.currency

    const issueDate = new Date(invoice.issue_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    })
    const dueDate = invoice.due_date 
      ? new Date(invoice.due_date).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric'
        })
      : 'On Arrival'

    const typeLabel = invoice.invoice_type === 'deposit' 
      ? `Deposit Invoice (${invoice.deposit_percent}%)`
      : invoice.invoice_type === 'final'
        ? 'Final Balance Invoice'
        : 'Invoice'

    const message = `📄 *${businessName}* 📄\n\n` +
      `Dear ${invoice.client_name},\n\n` +
      `Please find your invoice attached.\n\n` +
      `🧾 *${typeLabel}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Invoice:* ${invoice.invoice_number}\n` +
      `📅 *Issue Date:* ${issueDate}\n` +
      `⏰ *Due Date:* ${dueDate}\n\n` +
      `💰 *Balance Due: ${currencySymbol}${Number(invoice.balance_due).toFixed(2)}*\n\n` +
      `For questions, contact us:\n` +
      `📧 ${businessEmail}\n\n` +
      `Thank you! 🙏\n${businessName} Team`

    console.log('📤 Sending to:', clientPhone)

    const result = await sendWhatsAppMessage({
      to: clientPhone,
      body: message,
      mediaUrl: pdfUrl
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    // Update invoice status
    if (invoice.status === 'draft') {
      await supabase
        .from('invoices')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', invoiceId)
    }

    console.log('✅ Invoice sent with PDF:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      pdfUrl: pdfUrl,
      message: 'Invoice sent successfully via WhatsApp with PDF'
    })

  } catch (error: any) {
    console.error('❌ Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}