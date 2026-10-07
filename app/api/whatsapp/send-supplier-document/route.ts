import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { uploadShareablePdf } from '@/lib/storage/shareable-pdf'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

// POST - Send supplier document via WhatsApp with PDF attachment
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    if (!authResult.supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { supplierPhone, supplierName, documentNumber, documentType, clientName, serviceDate, pdfBase64 } = body

    if (!supplierPhone) return NextResponse.json({ success: false, error: 'Supplier phone number is required' }, { status: 400 })
    if (!pdfBase64) return NextResponse.json({ success: false, error: 'PDF attachment is required' }, { status: 400 })

    // Upload PDF to Supabase Storage (needs admin client for storage access)
    const adminClient = createAdminClient()
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    // Private bucket + signed link (lib/storage/shareable-pdf.ts).
    const shared = await uploadShareablePdf(adminClient, {
      tenantId: authResult.tenant_id,
      kind: 'supplier-documents',
      fileName: `${documentNumber || 'doc'}-${Date.now()}.pdf`,
      bytes: pdfBuffer,
    })
    if (!shared.ok) {
      console.error('Upload error:', shared.error)
      return NextResponse.json({ success: false, error: shared.error }, { status: 500 })
    }
    const pdfUrl = shared.url

    // Build WhatsApp message
    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    const businessName = senderTenant?.company_name || ''

    const message =
      `*${businessName}*\n\n` +
      `Dear ${supplierName || 'Partner'},\n\n` +
      `Please find the attached *${documentType || 'Document'}* (${documentNumber || 'N/A'}) for our guest *${clientName || 'N/A'}*.\n\n` +
      (serviceDate ? `Date: ${serviceDate}\n\n` : '') +
      `Please review and confirm at your earliest convenience.\n\n` +
      `Best regards,\n${businessName} Team`

    const result = await sendWhatsAppMessage({
      to: supplierPhone,
      body: message,
      mediaUrl: pdfUrl,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      pdfUrl,
      message: 'Supplier document sent via WhatsApp',
    })
  } catch (error: any) {
    console.error('Error sending supplier document via WhatsApp:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
