import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { requireAuth } from '@/lib/supabase-server'
import { getCurrencySymbol } from '@/lib/currency'

export async function POST(request: NextRequest) {
  try {
    // Require authentication - sends WhatsApp messages (costs money)
    const authResult = await requireAuth()
    if (authResult.error !== null) {
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

    const { paymentId } = await request.json()

    if (!paymentId) {
      return NextResponse.json({ success: false, error: 'Payment ID required' }, { status: 400 })
    }

    // Get payment details with itinerary
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

    const receiptNumber = payment.transaction_reference || `RCP-${payment.id.slice(0, 8).toUpperCase()}`
    const currencySymbol = getCurrencySymbol(payment.currency)
    const amount = `${currencySymbol}${Number(payment.amount).toFixed(2)}`
    const paymentDate = new Date(payment.payment_date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })

    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    const businessName = senderTenant?.company_name || ''
    const businessEmail = senderTenant?.contact_email || ''
    const businessWebsite = senderTenant?.company_website || ''

    // Build message
    const message = `🧾 *PAYMENT RECEIPT*\n\n` +
      `Dear ${payment.itineraries?.client_name || 'Valued Customer'},\n\n` +
      `Thank you for your payment! Here are the details:\n\n` +
      `📋 *Receipt Number:* ${receiptNumber}\n` +
      `📅 *Date:* ${paymentDate}\n` +
      `💳 *Payment Method:* ${payment.payment_method?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}\n` +
      `💰 *Amount:* ${amount}\n` +
      `🎫 *Itinerary:* ${payment.itineraries?.itinerary_code || 'N/A'}\n\n` +
      `This receipt confirms your payment has been received and processed.\n\n` +
      `For any questions, please contact us:\n` +
      `📧 ${businessEmail}\n` +
      (businessWebsite ? `🌐 ${businessWebsite}\n\n` : '') +
      `Best regards,\n*${businessName} Team*`



    // Send via WhatsApp
    const result = await sendWhatsAppMessage({
      to: clientPhone,
      body: message
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }



    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Receipt sent successfully'
    })

  } catch (error: any) {
    console.error('❌ Send receipt error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}