import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { paymentId } = await request.json()

    if (!paymentId) {
      return NextResponse.json({ success: false, error: 'Payment ID required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get payment details
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select(`
        *,
        itineraries (
          id,
          itinerary_code,
          client_name,
          client_phone,
          client_email
        )
      `)
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
    }

    const clientPhone = payment.itineraries?.client_phone
    if (!clientPhone) {
      return NextResponse.json({ success: false, error: 'Client phone not found' }, { status: 400 })
    }

    // Format phone number
    let formattedPhone = clientPhone.replace(/\D/g, '')
    if (!formattedPhone.startsWith('1') && formattedPhone.length === 10) {
      formattedPhone = '1' + formattedPhone
    }

    const receiptNumber = payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`
    const currencySymbol = { EUR: '€', USD: '$', GBP: '£', EGP: 'E£' }[payment.currency] || payment.currency
    const amount = `${currencySymbol}${Number(payment.amount).toFixed(2)}`
    const paymentDate = new Date(payment.payment_date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    // Build message
    const message = `🧾 *PAYMENT RECEIPT*

Dear ${payment.itineraries?.client_name || 'Valued Customer'},

Thank you for your payment! Here are the details:

📋 *Receipt Number:* ${receiptNumber}
📅 *Date:* ${paymentDate}
💳 *Payment Method:* ${payment.payment_method?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
💰 *Amount:* ${amount}
🎫 *Itinerary:* ${payment.itineraries?.itinerary_code || 'N/A'}

This receipt confirms your payment has been received and processed.

For any questions, please contact us.

Best regards,
*Travel2Egypt Team*
📧 info@travel2egypt.com
🌐 www.travel2egypt.org`

    // Send via WhatsApp Business API
    const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN
    const whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID

    if (!whatsappToken || !whatsappPhoneId) {
      return NextResponse.json({ success: false, error: 'WhatsApp not configured' }, { status: 500 })
    }

    const waResponse = await fetch(
      `https://graph.facebook.com/v18.0/${whatsappPhoneId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: { body: message }
        })
      }
    )

    const waData = await waResponse.json()

    if (!waResponse.ok) {
      console.error('WhatsApp API error:', waData)
      return NextResponse.json({ success: false, error: 'Failed to send WhatsApp message' }, { status: 500 })
    }

    // Log the message
    await supabase.from('whatsapp_messages').insert({
      direction: 'outgoing',
      phone_number: formattedPhone,
      message_type: 'text',
      content: message,
      status: 'sent',
      metadata: {
        type: 'receipt',
        payment_id: paymentId,
        receipt_number: receiptNumber
      }
    })

    return NextResponse.json({
      success: true,
      messageId: waData.messages?.[0]?.id,
      message: 'Receipt sent successfully'
    })

  } catch (error: any) {
    console.error('Send receipt error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}