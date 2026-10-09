import { serverPdfFontFor } from '@/lib/pdf/jspdf-font-server'
import { formatMoney } from '@/lib/currency-totals'
import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant, type SenderTenant } from '@/lib/sender-tenant'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { requireAuth } from '@/lib/supabase-server'
import { uploadShareablePdf } from '@/lib/storage/shareable-pdf'
import { createClient } from '@supabase/supabase-js'
import { generateInvoicePDF } from '@/lib/invoice-pdf-generator'
import { checkAmountDeliverable } from '@/lib/pricing-guards'
import { identityFromTenant, fetchLogoDataUrl } from '@/lib/company-identity'
import { checkPublicHttpUrl } from '@/lib/ssrf-guard'

// The invoice PDF a customer receives on WhatsApp is the SAME document the
// app downloads (lib/invoice-pdf-generator.ts) on the agency's letterhead —
// it was a separate, plainer pdf-lib layout with a one-line footer.
async function invoicePdfBytes(invoice: any, senderTenant: SenderTenant | null): Promise<Uint8Array> {
  // SSRF: validate the tenant logo URL before the server fetches it.
  const logoUrl = senderTenant?.logo_url
  const logoDataUrl = logoUrl && (await checkPublicHttpUrl(logoUrl)).ok
    ? await fetchLogoDataUrl(logoUrl)
    : undefined
  const company = { ...identityFromTenant(senderTenant), logoDataUrl }
  // The letterhead's own text (address, footer, tagline) counts too: a
  // Japanese address was drawn in Helvetica when only the invoice was checked.
  const pdf = generateInvoicePDF(invoice, company, await serverPdfFontFor(invoice, identityFromTenant(senderTenant)))
  return new Uint8Array(pdf.output('arraybuffer'))
}

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

    const body = await request.json()
    const { invoiceId } = body



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

    // Output gate (harness Layer 2): never send an invoice with a non-deliverable total.
    const priceCheck = checkAmountDeliverable(invoice.total_amount, { currency: invoice.currency })
    if (!priceCheck.ok) {
      return NextResponse.json(
        { success: false, error: 'Invoice total is not deliverable', violations: priceCheck.violations },
        { status: 422 }
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

    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    // The customer receives it SENT — the status flips to 'sent' below, after
    // the PDF was built, so a draft went out stamped "DRAFT".
    const pdfBytes = await invoicePdfBytes(
      { ...invoice, status: invoice.status === 'draft' ? 'sent' : invoice.status },
      senderTenant
    )

    // Upload to Supabase Storage (use admin client for storage)

    // Private bucket + signed link (lib/storage/shareable-pdf.ts): the old
    // `documents` bucket never existed, and a public link would expose it.
    const shared = await uploadShareablePdf(supabaseAdmin, {
      tenantId: authResult.tenant_id,
      kind: 'invoices',
      fileName: `invoice-${invoice.invoice_number}-${Date.now()}.pdf`,
      bytes: pdfBytes,
    })
    if (!shared.ok) {
      console.error('❌ Upload error:', shared.error)
      throw new Error(shared.error)
    }
    const pdfUrl = shared.url


    const businessName = senderTenant?.company_name || ''
    const businessEmail = senderTenant?.contact_email || ''

    const issueDate = new Date(invoice.issue_date).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    })
    const dueDate = invoice.due_date 
      ? new Date(invoice.due_date).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric'
        })
      // No due date: the terms on the invoice say when — never "On Arrival".
      : 'As per the payment terms on the invoice'

    const typeLabel = invoice.invoice_type === 'deposit' 
      ? `Deposit Invoice (${invoice.deposit_percent}%)`
      : invoice.invoice_type === 'final'
        ? 'Final Balance Invoice'
        : 'Invoice'

    const message = (businessName ? `📄 *${businessName}* 📄\n\n` : '') +
      `Dear ${invoice.client_name},\n\n` +
      `Please find your invoice attached.\n\n` +
      `🧾 *${typeLabel}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 *Invoice:* ${invoice.invoice_number}\n` +
      `📅 *Issue Date:* ${issueDate}\n` +
      `⏰ *Due Date:* ${dueDate}\n\n` +
      `💰 *Balance Due: ${formatMoney(invoice.balance_due, invoice.currency)}*\n\n` +
      `For questions, contact us:\n` +
      (businessEmail ? `📧 ${businessEmail}\n\n` : '') +
      `Thank you! 🙏\n${businessName ? businessName + ' Team' : 'Your travel team'}`



    const result = await sendWhatsAppMessage({
      // A local number takes this tenant's country code (lib/whatsapp).
      tenantId: authResult.tenant_id,
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