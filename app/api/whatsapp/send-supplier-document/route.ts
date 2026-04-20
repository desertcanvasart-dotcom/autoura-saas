import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { sendWhatsAppMessage } from '@/lib/twilio-whatsapp'

// POST - Send supplier document via WhatsApp with PDF attachment
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    if (!authResult.supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { supplierPhone, supplierName, documentNumber, documentType, clientName, serviceDate, pdfBase64 } = body

    if (!supplierPhone) return NextResponse.json({ success: false, error: 'Supplier phone number is required' }, { status: 400 })
    if (!pdfBase64) return NextResponse.json({ success: false, error: 'PDF attachment is required' }, { status: 400 })

    // Upload PDF to Supabase Storage (needs admin client for storage access)
    const adminClient = createAdminClient()
    const fileName = `supplier-documents/${(documentNumber || 'doc').replace(/\s+/g, '-')}-${Date.now()}.pdf`
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')

    const { error: uploadError } = await adminClient.storage
      .from('documents')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ success: false, error: `Failed to upload PDF: ${uploadError.message}` }, { status: 500 })
    }

    const { data: urlData } = adminClient.storage
      .from('documents')
      .getPublicUrl(fileName)

    const pdfUrl = urlData.publicUrl

    // Build WhatsApp message
    const businessName = process.env.BUSINESS_NAME || 'AUTOURA'

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
