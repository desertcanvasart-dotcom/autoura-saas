import { attachmentNameParams, encodeEmailHeader } from '@/lib/email/mime-header'
import { NextResponse } from 'next/server'
import { loadSenderTenant } from '@/lib/sender-tenant'
import { requireAuth, createAdminClient } from '@/lib/supabase-server'
import { getGmailClient, refreshAccessToken } from '@/lib/gmail'
import { escapeHtml } from '@/lib/html-escape'
import { markSupplierDocumentSent } from '@/lib/documents/mark-sent'

// POST - Send supplier document via Gmail with PDF attachment
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth()
    if (authResult.error !== null) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    // The recipient, number and names come from the voucher row, not the
    // request: the page chooses only which voucher, its display title and the
    // PDF it rendered from that row.
    const { documentId, documentType: documentTitle, pdfBase64 } = body

    if (!pdfBase64) return NextResponse.json({ success: false, error: 'PDF attachment is required' }, { status: 400 })

    // Only a voucher of the caller's own tenant (RLS on supplier_documents).
    const { data: ownDocument } = documentId
      ? await supabase
          .from('supplier_documents')
          .select('id, document_type, document_number, supplier_name, supplier_contact_email, client_name')
          .eq('id', documentId)
          .maybeSingle()
      : { data: null }
    if (!ownDocument) return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })

    const supplierEmail = ownDocument.supplier_contact_email
    if (!supplierEmail) return NextResponse.json({ success: false, error: 'Supplier email is required' }, { status: 400 })
    const supplierName = ownDocument.supplier_name
    const documentNumber = ownDocument.document_number
    const clientName = ownDocument.client_name
    const documentType = documentTitle || ownDocument.document_type

    const senderTenant = await loadSenderTenant(authResult.tenant_id)
    const businessName = senderTenant?.company_name || ''
    // The tenant's own address — never the platform's GMAIL_USER.
    const businessEmail = senderTenant?.contact_email || ''

    const emailSubject = `${documentType || 'Document'} - ${documentNumber || 'N/A'} | Guest: ${clientName || 'N/A'}${businessName ? ` | ${businessName}` : ''}`

    const emailBody = `
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: linear-gradient(135deg, #647C47 0%, #4a5c35 100%); color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 25px; background: #ffffff; }
    .details { background: #f0f5eb; padding: 15px; border-left: 4px solid #647C47; margin: 15px 0; border-radius: 4px; }
    .footer { background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border-top: 2px solid #e5e7eb; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    ${businessName ? `<h2 style="margin: 0;">${escapeHtml(businessName)}</h2>` : ''}
    <p style="margin: 5px 0 0 0; opacity: 0.9;">${escapeHtml(documentType || 'Supplier Document')}</p>
  </div>
  <div class="content">
    <p>Dear <strong>${escapeHtml(supplierName || 'Partner')}</strong>,</p>
    <p>Please find the attached ${escapeHtml(String(documentType || 'document').toLowerCase())} for your reference.</p>
    <div class="details">
      <p><strong>Document:</strong> ${escapeHtml(documentNumber || 'N/A')}</p>
      <p><strong>Type:</strong> ${escapeHtml(documentType || 'N/A')}</p>
      <p><strong>Guest:</strong> ${escapeHtml(clientName || 'N/A')}</p>
    </div>
    <p>Please review the attached document and confirm at your earliest convenience.</p>
    <p>Best regards${businessName ? `,<br/><strong>${escapeHtml(businessName)} Team</strong>` : ','}</p>
  </div>
  <div class="footer">
    <p>${[businessName, businessEmail].filter(Boolean).map(v => escapeHtml(String(v))).join(' | ')}</p>
  </div>
</body>
</html>`

    // Get Gmail tokens for the signed-in user.
    //
    // This previously selected `.limit(1)` with NO user filter and leaned
    // entirely on RLS to narrow it to the caller's own row. Read with the
    // admin client (see migration 273) that would pick an arbitrary row from
    // any tenant, so the filter RLS was applying is now written out.
    const { data: tokenRecord } = await createAdminClient()
      .from('gmail_tokens')
      .select('access_token, refresh_token, user_id')
      .eq('user_id', authResult.user!.id)
      .single()

    if (!tokenRecord || !tokenRecord.refresh_token) {
      return NextResponse.json({ success: false, error: 'Gmail not connected. Connect in Settings > Email.' }, { status: 401 })
    }

    // Refresh token and get Gmail client
    let accessToken = tokenRecord.access_token
    try {
      const refreshed = await refreshAccessToken(tokenRecord.refresh_token)
      accessToken = refreshed.access_token || accessToken
    } catch {}

    const gmail = getGmailClient(accessToken, tokenRecord.refresh_token)

    // Build MIME email with PDF attachment
    const filename = `${(documentNumber || 'doc').replace(/\s+/g, '_')}_${(supplierName || 'supplier').replace(/\s+/g, '_')}.pdf`
    const rawEmail = buildEmailWithAttachment(supplierEmail, emailSubject, emailBody, filename, pdfBase64)

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawEmail },
    })

    // The email has gone: record it here, not in a second request from the page.
    const marked = await markSupplierDocumentSent(supabase, { documentId: ownDocument.id })
    if (marked.error) console.error('Supplier document sent but not marked sent:', marked.error)

    return NextResponse.json({
      success: true,
      messageId: response.data.id,
      message: 'Email sent successfully',
    })
  } catch (error: any) {
    console.error('Error sending supplier document email:', error)
    return NextResponse.json({ success: false, error: error.message || 'Failed to send email' }, { status: 500 })
  }
}

function buildEmailWithAttachment(to: string, subject: string, body: string, filename: string, attachmentBase64: string): string {
  const boundary = `boundary_${Date.now()}`

  // Strip CR/LF from header values to prevent header/Bcc injection.
  const stripHeader = (v: string) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim()
  // An ASCII name plus RFC 2231 filename* for a non-ASCII one (lib/email/mime-header).
  const fileParams = attachmentNameParams(filename)

  // No From: Gmail sends as the signed-in user's own account, and the copy is
  // in its Sent folder. There used to be a From and a Bcc naming the
  // platform-wide GMAIL_USER, which copied every tenant's vouchers to one
  // mailbox and claimed an address the sending account does not own.
  const emailParts = [
    `To: ${stripHeader(to)}`,
    // RFC 2047: the subject carries the guest's name, often Japanese.
    `Subject: ${encodeEmailHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
    `--${boundary}`,
    `Content-Type: application/pdf; ${fileParams.name}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; ${fileParams.disposition}`,
    '',
    attachmentBase64,
    `--${boundary}--`,
  ]

  return Buffer.from(emailParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
