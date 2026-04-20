import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase-server'
import { getGmailClient, refreshAccessToken } from '@/lib/gmail'

// POST - Send supplier document via Gmail with PDF attachment
export async function POST(request: Request) {
  try {
    const authResult = await requireAuth()
    if (authResult.error) return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status })
    const { supabase } = authResult
    if (!supabase) return NextResponse.json({ success: false, error: 'Auth failed' }, { status: 401 })

    const body = await request.json()
    const { supplierEmail, supplierName, documentNumber, documentType, clientName, pdfBase64 } = body

    if (!supplierEmail) return NextResponse.json({ success: false, error: 'Supplier email is required' }, { status: 400 })
    if (!pdfBase64) return NextResponse.json({ success: false, error: 'PDF attachment is required' }, { status: 400 })

    const businessName = process.env.BUSINESS_NAME || 'AUTOURA'
    const businessEmail = process.env.BUSINESS_EMAIL || process.env.GMAIL_USER || ''

    const emailSubject = `${documentType || 'Document'} - ${documentNumber || 'N/A'} | Guest: ${clientName || 'N/A'} | ${businessName}`

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
    <h2 style="margin: 0;">${businessName}</h2>
    <p style="margin: 5px 0 0 0; opacity: 0.9;">${documentType || 'Supplier Document'}</p>
  </div>
  <div class="content">
    <p>Dear <strong>${supplierName || 'Partner'}</strong>,</p>
    <p>Please find the attached ${(documentType || 'document').toLowerCase()} for your reference.</p>
    <div class="details">
      <p><strong>Document:</strong> ${documentNumber || 'N/A'}</p>
      <p><strong>Type:</strong> ${documentType || 'N/A'}</p>
      <p><strong>Guest:</strong> ${clientName || 'N/A'}</p>
    </div>
    <p>Please review the attached document and confirm at your earliest convenience.</p>
    <p>Best regards,<br/><strong>${businessName} Team</strong></p>
  </div>
  <div class="footer">
    <p>${businessName} | ${businessEmail}</p>
  </div>
</body>
</html>`

    // Get Gmail tokens for the user
    const { data: tokenRecord } = await supabase
      .from('gmail_tokens')
      .select('access_token, refresh_token, user_id')
      .limit(1)
      .single()

    if (!tokenRecord) {
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
  const fromAddress = process.env.GMAIL_USER || process.env.BUSINESS_EMAIL || ''
  const fromName = process.env.BUSINESS_NAME || 'AUTOURA'
  const boundary = `boundary_${Date.now()}`

  const emailParts = [
    `From: ${fromName} <${fromAddress}>`,
    `To: ${to}`,
    `Bcc: ${fromAddress}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64'),
    `--${boundary}`,
    `Content-Type: application/pdf; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
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
