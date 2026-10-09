import { NextRequest, NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { uploadShareablePdf } from '@/lib/storage/shareable-pdf'
import { markSupplierDocumentSent } from '@/lib/documents/mark-sent'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

// POST - Send supplier document via WhatsApp with PDF attachment
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    if (!authResult.supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    // The recipient, number and names come from the voucher row, not the
    // request: the caller chooses only which voucher, its title and the PDF.
    const { documentId, documentType: documentTitle, pdfBase64 } = body

    if (!pdfBase64) return NextResponse.json({ success: false, error: 'PDF attachment is required' }, { status: 400 })

    // Only a voucher of the caller's own tenant (RLS on supplier_documents).
    const { data: ownDocument } = documentId
      ? await authResult.supabase
          .from('supplier_documents')
          .select('id, document_type, document_number, supplier_name, supplier_contact_name, supplier_contact_phone, client_name, check_in, service_date')
          .eq('id', documentId)
          .maybeSingle()
      : { data: null }
    if (!ownDocument) return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })

    const supplierPhone = ownDocument.supplier_contact_phone
    if (!supplierPhone) return NextResponse.json({ success: false, error: 'Supplier phone number is required' }, { status: 400 })
    const supplierName = ownDocument.supplier_contact_name || ownDocument.supplier_name
    const documentNumber = ownDocument.document_number
    const clientName = ownDocument.client_name
    const documentType = documentTitle || ownDocument.document_type
    const serviceDate = ownDocument.check_in || ownDocument.service_date

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
      (businessName ? `*${businessName}*\n\n` : '') +
      `Dear ${supplierName || 'Partner'},\n\n` +
      `Please find the attached *${documentType || 'Document'}* (${documentNumber || 'N/A'}) for our guest *${clientName || 'N/A'}*.\n\n` +
      (serviceDate ? `Date: ${serviceDate}\n\n` : '') +
      `Please review and confirm at your earliest convenience.\n\n` +
      (businessName ? `Best regards,\n${businessName} Team` : 'Best regards')

    const result = await sendWhatsAppMessage({
      // A local number takes this tenant's country code (lib/whatsapp).
      tenantId: authResult.tenant_id,
      to: supplierPhone,
      body: message,
      mediaUrl: pdfUrl,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    // The message has gone: record it here.
    const marked = await markSupplierDocumentSent(authResult.supabase, { documentId: ownDocument.id })
    if (marked.error) console.error('Supplier document sent but not marked sent:', marked.error)

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
