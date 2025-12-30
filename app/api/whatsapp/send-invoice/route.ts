import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { invoiceId } = body

    console.log('📤 Send invoice request:', { invoiceId })

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'Invoice ID is required' },
        { status: 400 }
      )
    }

    // Create server-side Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    console.log('📋 Invoice lookup:', { found: !!invoice, error: invoiceError?.message })

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { success: false, error: `Invoice not found: ${invoiceError?.message || 'No data'}` },
        { status: 404 }
      )
    }

    // Get client phone from clients table
    let clientPhone = null
    if (invoice.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('phone')
        .eq('id', invoice.client_id)
        .single()
      clientPhone = client?.phone
      console.log('📱 Client phone from clients:', clientPhone)
    }

    // Or try to get from itinerary
    if (!clientPhone && invoice.itinerary_id) {
      const { data: itinerary } = await supabase
        .from('itineraries')
        .select('client_phone')
        .eq('id', invoice.itinerary_id)
        .single()
      clientPhone = itinerary?.client_phone
      console.log('📱 Client phone from itinerary:', clientPhone)
    }

    if (!clientPhone) {
      return NextResponse.json(
        { success: false, error: 'Client phone number not found. Please add phone to client profile.' },
        { status: 400 }
      )
    }

    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    const businessEmail = process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'

    const currencySymbol = { EUR: '€', USD: '$', GBP: '£' }[invoice.currency] || invoice.currency

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
      `Please find your invoice details below:\n\n` +
      `🧾 *${typeLabel}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Invoice:* ${invoice.invoice_number}\n` +
      `📅 *Issue Date:* ${issueDate}\n` +
      `⏰ *Due Date:* ${dueDate}\n\n` +
      `💰 *Amount Details:*\n` +
      `• Total: ${currencySymbol}${Number(invoice.total_amount).toFixed(2)}\n` +
      `• Paid: ${currencySymbol}${Number(invoice.amount_paid).toFixed(2)}\n` +
      `• *Balance Due: ${currencySymbol}${Number(invoice.balance_due).toFixed(2)}*\n\n` +
      (invoice.payment_terms ? `📝 *Payment Terms:*\n${invoice.payment_terms}\n\n` : '') +
      `💳 *Payment Methods:*\n` +
      `• Bank Transfer\n` +
      `• Credit Card\n` +
      `• Wise / PayPal\n\n` +
      `For payment details or questions:\n` +
      `📧 ${businessEmail}\n\n` +
      `Thank you for your business! 🙏\n\n` +
      `Best regards,\n${businessName} Team`

    console.log('📤 Sending to:', clientPhone)

    const result = await sendWhatsAppMessage({
      to: clientPhone,
      body: message
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

    console.log('✅ Invoice sent:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Invoice sent successfully via WhatsApp'
    })

  } catch (error: any) {
    console.error('❌ Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}