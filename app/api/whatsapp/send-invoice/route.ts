import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'
import { createClient } from '@/app/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { invoiceId } = body

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: 'Invoice ID is required' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Get invoice with client details
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice not found' },
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
    }

    // Or try to get from itinerary
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
        { success: false, error: 'Client phone number not found' },
        { status: 400 }
      )
    }

    const businessName = process.env.BUSINESS_NAME || 'Travel2Egypt'
    const businessEmail = process.env.BUSINESS_EMAIL || 'info@travel2egypt.com'

    // Format currency
    const currencySymbol = { EUR: '€', USD: '$', GBP: '£' }[invoice.currency] || invoice.currency

    // Format dates
    const issueDate = new Date(invoice.issue_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    })
    const dueDate = invoice.due_date 
      ? new Date(invoice.due_date).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric'
        })
      : 'On Arrival'

    // Determine invoice type label
    const typeLabel = invoice.invoice_type === 'deposit' 
      ? `Deposit Invoice (${invoice.deposit_percent}%)`
      : invoice.invoice_type === 'final'
        ? 'Final Balance Invoice'
        : 'Invoice'

    // Build message
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
      `For payment details or questions, please contact us:\n` +
      `📧 ${businessEmail}\n\n` +
      `Thank you for your business! 🙏\n\n` +
      `Best regards,\n${businessName} Team`

    console.log('📤 Sending invoice via WhatsApp:', {
      to: clientPhone,
      invoiceNumber: invoice.invoice_number
    })

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

    // Update invoice status to sent if it was draft
    if (invoice.status === 'draft') {
      await supabase
        .from('invoices')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', invoiceId)
    }

    console.log('✅ Invoice sent via WhatsApp:', result.messageId)

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Invoice sent successfully via WhatsApp'
    })

  } catch (error: any) {
    console.error('❌ Error sending invoice:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}