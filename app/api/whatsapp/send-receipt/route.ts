import { receiptNumberFor } from '@/lib/receipt-pdf-generator'
import { formatMoney } from '@/lib/currency-totals'
import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { requireAuth } from '@/lib/supabase-server'
import { formatDateOnly } from '@/lib/date-utils'

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

    const { paymentId, invoicePaymentId } = await request.json()

    if (!paymentId && !invoicePaymentId) {
      return NextResponse.json({ success: false, error: 'Payment ID required' }, { status: 400 })
    }

    // What the receipt says, from either kind of payment. A payment recorded
    // against an invoice is a receipt too: the receipts page sent those the
    // INVOICE ("Balance Due …"), and flipped a draft invoice to 'sent'.
    let receipt: {
      clientName: string | null
      clientPhone: string | null
      receiptNumber: string
      amount: unknown
      currency: unknown
      paymentDate: string
      paymentMethod: string | null
      referenceLabel: string
      reference: string
    }

    if (invoicePaymentId) {
      const { data: ip, error: ipError } = await supabase
        .from('invoice_payments')
        .select('id, amount, currency, payment_method, payment_date, transaction_reference, invoices (invoice_number, client_name, client_id, itinerary_id)')
        .eq('id', invoicePaymentId)
        .single()

      if (ipError || !ip) {
        return NextResponse.json({ success: false, error: 'Payment not found' }, { status: 404 })
      }
      const inv = (ip as unknown as { invoices: { invoice_number: string; client_name: string; client_id: string | null; itinerary_id: string | null } | null }).invoices

      // The same phone the invoice send uses: the client's, else the trip's.
      let phone: string | null = null
      if (inv?.client_id) {
        const { data: client } = await supabase.from('clients').select('phone').eq('id', inv.client_id).single()
        phone = client?.phone ?? null
      }
      if (!phone && inv?.itinerary_id) {
        const { data: itin } = await supabase.from('itineraries').select('client_phone').eq('id', inv.itinerary_id).single()
        phone = itin?.client_phone ?? null
      }

      receipt = {
        clientName: inv?.client_name ?? null,
        clientPhone: phone,
        receiptNumber: receiptNumberFor(ip),
        amount: ip.amount,
        currency: ip.currency,
        paymentDate: ip.payment_date,
        paymentMethod: ip.payment_method,
        referenceLabel: 'Invoice',
        reference: inv?.invoice_number || 'N/A',
      }
    } else {
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

      // A receipt says the money arrived; never send one for a pending,
      // failed or refunded payment.
      if (payment.status !== 'completed') {
        return NextResponse.json(
          { success: false, error: `This payment is ${payment.status ?? 'not completed'}; a receipt is only sent once it is completed.` },
          { status: 409 }
        )
      }

      receipt = {
        clientName: payment.itineraries?.client_name ?? null,
        clientPhone: payment.itineraries?.client_phone ?? null,
        receiptNumber: receiptNumberFor(payment),
        amount: payment.amount,
        currency: payment.currency,
        paymentDate: payment.payment_date,
        paymentMethod: payment.payment_method,
        referenceLabel: 'Itinerary',
        reference: payment.itineraries?.itinerary_code || 'N/A',
      }
    }

    const clientPhone = receipt.clientPhone
    if (!clientPhone) {
      return NextResponse.json({ success: false, error: 'Client phone not found' }, { status: 400 })
    }

    const receiptNumber = receipt.receiptNumber
    const amount = formatMoney(receipt.amount, receipt.currency)
    const paymentDate = formatDateOnly(receipt.paymentDate, 'en-GB', {
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
      `Dear ${receipt.clientName || 'Valued Customer'},\n\n` +
      `Thank you for your payment! Here are the details:\n\n` +
      `📋 *Receipt Number:* ${receiptNumber}\n` +
      `📅 *Date:* ${paymentDate}\n` +
      `💳 *Payment Method:* ${receipt.paymentMethod?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}\n` +
      `💰 *Amount:* ${amount}\n` +
      `🎫 *${receipt.referenceLabel}:* ${receipt.reference}\n\n` +
      `This receipt confirms your payment has been received and processed.\n\n` +
      `For any questions, please contact us:\n` +
      `📧 ${businessEmail}\n` +
      (businessWebsite ? `🌐 ${businessWebsite}\n\n` : '') +
      `Best regards,\n*${businessName} Team*`



    // Send via WhatsApp
    const result = await sendWhatsAppMessage({
      // A local number takes this tenant's country code (lib/whatsapp).
      tenantId: authResult.tenant_id,
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